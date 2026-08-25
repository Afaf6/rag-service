const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  uploadDocument,
  listDocuments,
  deleteDocument,
  syncMedicalHistory,
} = require('../controllers/documentController');

router.use(authenticate); // كل الراوتس هنا لازم توكين مريض صالح

router.post('/upload', upload.single('file'), uploadDocument);
router.post('/sync', syncMedicalHistory);
router.get('/', listDocuments);
router.delete('/:id', deleteDocument);

module.exports = router;
