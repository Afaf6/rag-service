const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Chunk = require('../models/Chunk');

const extractText = require('../utils/extractText');
const chunkText = require('../utils/chunker');
const { embedTexts } = require('../utils/embeddings');

const { ALLOWED_MIME_TYPES } = require('../middleware/upload');

/**
 * Complete document ingestion pipeline:
 *
 * 1. Validate the uploaded file type.
 * 2. Check whether the same file was already uploaded by this patient.
 * 3. Create the document with "processing" status.
 * 4. Extract text from the file.
 * 5. Split the text into chunks.
 * 6. Generate embeddings for all chunks.
 * 7. Store chunks with patientId and documentId.
 * 8. Mark the document as "ready".
 * 9. If anything fails, mark the document as "failed".
 * 10. Delete the temporary uploaded file.
 */
async function ingestFile({
  filePath,
  originalFilename,
  mimeType,
  sizeBytes,
  patientId,
  category,
}) {
  let document = null;

  try {
    // --------------------------------------------------
    // 1. Validate file type
    // --------------------------------------------------

    const fileType = ALLOWED_MIME_TYPES[mimeType];

    if (!fileType) {
      throw new Error(
        'Unsupported file type. Only PDF, JPEG, PNG, and WebP files are allowed.'
      );
    }

    // --------------------------------------------------
    // 2. Check for duplicate upload
    // --------------------------------------------------
    // This prevents the same patient from indexing
    // the same filename + file size multiple times.

    const existingDocument = await Document.findOne({
      patientId,
      originalFilename,
      sizeBytes,
      status: 'ready',
    });

    if (existingDocument) {
      throw new Error(
        'This file has already been uploaded and processed.'
      );
    }

    // --------------------------------------------------
    // 3. Create document record
    // --------------------------------------------------

    document = await Document.create({
      patientId,
      originalFilename,
      fileType,
      mimeType,
      sizeBytes,
      category: category || 'other',
      status: 'processing',
    });

    // --------------------------------------------------
    // 4. Extract text
    // --------------------------------------------------

    const text = await extractText(filePath, fileType);

    if (!text || text.trim().length < 10) {
      throw new Error(
        'Could not extract enough useful text from the uploaded file.'
      );
    }

    // --------------------------------------------------
    // 5. Split extracted text into chunks
    // --------------------------------------------------

    const chunks = chunkText(text);

    if (!chunks || chunks.length === 0) {
      throw new Error(
        'No usable text chunks could be created from the document.'
      );
    }

    // --------------------------------------------------
    // 6. Generate embeddings
    // --------------------------------------------------

    const embeddings = await embedTexts(chunks);

    if (!embeddings || embeddings.length !== chunks.length) {
      throw new Error(
        'Failed to generate embeddings for all document chunks.'
      );
    }

    // --------------------------------------------------
    // 7. Create Chunk documents
    // --------------------------------------------------

    const chunkDocs = chunks.map((chunkTextValue, index) => ({
      patientId,
      documentId: document._id,

      text: chunkTextValue,

      chunkIndex: index,

      embedding: embeddings[index],

      metadata: {
        originalFilename,
        category: document.category,
      },
    }));

    // --------------------------------------------------
    // 8. Save chunks
    // --------------------------------------------------

    await Chunk.insertMany(chunkDocs);

    // --------------------------------------------------
    // 9. Update document
    // --------------------------------------------------

    document.extractedText = text;
    document.chunksCount = chunkDocs.length;
    document.status = 'ready';
    document.errorMessage = undefined;

    await document.save();

    return document;
  } catch (error) {
    console.error('Document ingestion error:', error);

    // If the Document record was already created,
    // mark it as failed.
    if (document) {
      document.status = 'failed';
      document.errorMessage = error.message;

      await document.save();
    }

    throw error;
  } finally {
    // --------------------------------------------------
    // 10. Always delete temporary uploaded file
    // --------------------------------------------------

    if (filePath) {
      fs.unlink(filePath, (unlinkError) => {
        if (unlinkError) {
          console.error(
            'Failed to delete temporary uploaded file:',
            unlinkError.message
          );
        }
      });
    }
  }
}

module.exports = {
  ingestFile,
  ingestFromUrl,
};

/**
 * نفس الـ pipeline بتاع ingestFile، بس بتاخد رابط مستند بدل ملف مرفوع
 * مباشرة عن طريق multer. بنستخدمها وقت مزامنة المستندات من الباك اند
 * الرئيسي (Medical History) بدل رفع منفصل.
 */
async function ingestFromUrl({
  fileUrl,
  originalFilename,
  patientId,
  sourceRecordId,
  diseaseContext,
}) {
  const EXTENSION_TO_FILETYPE = {
    '.pdf': { fileType: 'pdf', mimeType: 'application/pdf' },
    '.jpg': { fileType: 'image', mimeType: 'image/jpeg' },
    '.jpeg': { fileType: 'image', mimeType: 'image/jpeg' },
    '.png': { fileType: 'image', mimeType: 'image/png' },
  };

  const ext = path.extname(new URL(fileUrl).pathname).toLowerCase();
  const typeInfo = EXTENSION_TO_FILETYPE[ext];

  if (!typeInfo) {
    throw new Error(`Unsupported file extension for sync: ${ext}`);
  }

  // نزّل الملف مؤقتاً على القرص عشان نقدر نستخدم نفس دوال الاستخراج
  const tempFilename = `sync-${patientId}-${Date.now()}${ext}`;
  const tempFilePath = path.join(process.env.UPLOAD_DIR || 'uploads', tempFilename);

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download document from main backend: ${fileUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempFilePath, buffer);

  const document = await Document.create({
    patientId,
    originalFilename,
    fileType: typeInfo.fileType,
    mimeType: typeInfo.mimeType,
    sizeBytes: buffer.length,
    category: 'other',
    status: 'processing',
    sourceRecordId,
    sourceUrl: fileUrl,
    diseaseContext,
  });

  try {
    const text = await extractText(tempFilePath, typeInfo.fileType);

    if (!text || text.trim().length < 10) {
      throw new Error('Could not extract enough useful text from the synced document.');
    }

    const chunks = chunkText(text);
    const embeddings = await embedTexts(chunks);

    const chunkDocs = chunks.map((chunkTextValue, index) => ({
      patientId,
      documentId: document._id,
      text: chunkTextValue,
      chunkIndex: index,
      embedding: embeddings[index],
      metadata: { originalFilename, category: 'other' },
    }));

    await Chunk.insertMany(chunkDocs);

    document.extractedText = text;
    document.chunksCount = chunkDocs.length;
    document.status = 'ready';
    await document.save();
  } catch (error) {
    document.status = 'failed';
    document.errorMessage = error.message;
    await document.save();
    throw error;
  } finally {
    fs.unlink(tempFilePath, () => {});
  }

  return document;
}