const Document = require('../models/Document');
const Chunk = require('../models/Chunk');
const { ingestFile } = require('../services/ingestService');
const { syncFromMainBackend } = require('../services/historySyncService');

// Allowed medical file types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

// Allowed medical document categories
const ALLOWED_CATEGORIES = [
  'lab',
  'prescription',
  'medical_report',
  'xray',
  'mri',
  'scan',
  'other',
];

// POST /api/documents/upload
// async function uploadDocument(req, res) {
//   try {
//     // Make sure authentication middleware provided patientId
//     if (!req.patientId) {
//       return res.status(401).json({
//         error: 'Patient identity not found',
//       });
//     }

//     // Make sure a file was uploaded
//     if (!req.file) {
//       return res.status(400).json({
//         error: 'No file was attached',
//       });
//     }

//     // Validate file type
//     if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
//       return res.status(400).json({
//         error:
//           'Invalid file type. Only PDF, JPEG, PNG, and WebP medical files are allowed.',
//       });
//     }

//     // Validate category
//     const category = req.body.category || 'other';

//     if (!ALLOWED_CATEGORIES.includes(category)) {
//       return res.status(400).json({
//         error: `Invalid category. Allowed categories: ${ALLOWED_CATEGORIES.join(
//           ', '
//         )}`,
//       });
//     }

//     const document = await ingestFile({
//       filePath: req.file.path,
//       originalFilename: req.file.originalname,
//       mimeType: req.file.mimetype,
//       sizeBytes: req.file.size,

//       // IMPORTANT:
//       // The patientId comes from the verified JWT,
//       // not from the request body.
//       patientId: req.patientId,

//       category,
//     });

//     return res.status(201).json({
//       message: 'File uploaded and processed successfully',
//       document,
//     });
//   } catch (err) {
//     console.error('Ingest error:', err);

//     return res.status(500).json({
//       error: 'File processing failed',
//       details: err.message,
//     });
//   }
// }

async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file was attached',
    });
  }

  try {
    if (!req.patientId) {
      return res.status(401).json({
        error: 'Patient identity not found',
      });
    }

    const document = await ingestFile({
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      patientId: req.patientId,
      category: req.body.category,
    });

    return res.status(201).json({
      message: 'File uploaded and processed successfully',
      document,
    });
  } catch (err) {
    console.error('Ingest error:', err);

    if (
      err.message ===
      'This file has already been uploaded and processed.'
    ) {
      return res.status(409).json({
        error: err.message,
      });
    }

    return res.status(500).json({
      error: 'File processing failed',
      details: err.message,
    });
  }
}

// GET /api/documents
async function listDocuments(req, res) {
  try {
    if (!req.patientId) {
      return res.status(401).json({
        error: 'Patient identity not found',
      });
    }

    const documents = await Document.find({
      patientId: req.patientId,
    })
      .select('-extractedText')
      .sort({ createdAt: -1 });

    return res.json({
      documents,
    });
  } catch (err) {
    console.error('List documents error:', err);

    return res.status(500).json({
      error: 'Failed to retrieve documents',
      details: err.message,
    });
  }
}

// DELETE /api/documents/:id
async function deleteDocument(req, res) {
  try {
    if (!req.patientId) {
      return res.status(401).json({
        error: 'Patient identity not found',
      });
    }

    const { id } = req.params;

    // Find the document ONLY if it belongs to this patient
    const document = await Document.findOne({
      _id: id,
      patientId: req.patientId,
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Delete all RAG chunks belonging to this document
    await Chunk.deleteMany({
      documentId: document._id,
      patientId: req.patientId,
    });

    // Delete the original document record
    await document.deleteOne();

    return res.json({
      message: 'Document and its RAG chunks deleted successfully',
    });
  } catch (err) {
    console.error('Delete document error:', err);

    return res.status(500).json({
      error: 'Failed to delete document',
      details: err.message,
    });
  }
}

// POST /api/documents/sync
// بيسحب مستندات المريض من الـ Medical History بتاع الباك اند الرئيسي
// ويعالج أي مستند جديد لسه معملتلوش embedding.
async function syncMedicalHistory(req, res) {
  try {
    if (!req.patientId) {
      return res.status(401).json({ error: 'Patient identity not found' });
    }

    // بنستخدم نفس التوكين اللي المريض بعته لنا عشان نكلم بيه الباك اند الرئيسي
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];

    const results = await syncFromMainBackend(req.patientId, token);

    return res.json({
      message: 'Sync completed',
      syncedCount: results.synced.length,
      skippedCount: results.skipped.length,
      failedCount: results.failed.length,
      details: results,
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({
      error: 'Failed to sync medical history',
      details: err.message,
    });
  }
}

module.exports = {
  uploadDocument,
  listDocuments,
  deleteDocument,
  syncMedicalHistory,
};