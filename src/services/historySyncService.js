const Document = require('../models/Document');
const { ingestFromUrl } = require('./ingestService');

const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3000/api';

/**
 * بيجيب كل فولدرات الأمراض بتاعت المريض من الباك اند الرئيسي.
 */
async function fetchFolders(token) {
  const response = await fetch(`${MAIN_BACKEND_URL}/get-folders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch medical folders from main backend');
  }
  const data = await response.json();
  return data.folder || [];
}

/**
 * بيجيب كل السجلات (وبالتالي المستندات) جوه فولدر معين.
 */
async function fetchRecords(token, folderId) {
  const response = await fetch(`${MAIN_BACKEND_URL}/get-file/${folderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch records for folder ${folderId}`);
  }
  const data = await response.json();
  return data.records || [];
}

/**
 * الدالة الأساسية: بتسحب كل الـ Medical History بتاع المريض من الباك اند
 * الرئيسي وتعالج أي مستند جديد لسه معملتلوش embedding.
 *
 * مستند "جديد" = مفيش Document عندنا بنفس sourceUrl لنفس المريض.
 * ده بيمنعنا نعيد معالجة نفس المستند في كل مزامنة.
 */
async function syncFromMainBackend(patientId, token) {
  const folders = await fetchFolders(token);

  const results = { synced: [], skipped: [], failed: [] };

  for (const folder of folders) {
    let records;
    try {
      records = await fetchRecords(token, folder._id);
    } catch (err) {
      // فولدر واحد فشل مش لازم يوقف باقي المزامنة
      continue;
    }

    for (const record of records) {
      const documentUrls = record.documents || [];

      for (const fileUrl of documentUrls) {
        const alreadySynced = await Document.findOne({
          patientId,
          sourceUrl: fileUrl,
        });

        if (alreadySynced) {
          results.skipped.push(fileUrl);
          continue;
        }

        try {
          const originalFilename = fileUrl.split('/').pop();
          const doc = await ingestFromUrl({
            fileUrl,
            originalFilename,
            patientId,
            sourceRecordId: record._id,
            diseaseContext: folder.disease,
          });
          results.synced.push({ id: doc._id, filename: originalFilename, disease: folder.disease });
        } catch (err) {
          results.failed.push({ url: fileUrl, error: err.message });
        }
      }
    }
  }

  return results;
}

module.exports = { syncFromMainBackend };
