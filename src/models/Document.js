const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      index: true, // أهم index في السيستم كله - عزل بيانات كل مريض
    },
    originalFilename: { type: String, required: true },
    fileType: {
      type: String,
      enum: ['pdf', 'docx', 'image'],
      required: true,
    },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number },
    category: {
      // نوع المستند: روشيتة / تحليل / أشعة... المريض يقدر يحدده وقت الرفع
      type: String,
      enum: ['prescription', 'lab_result', 'scan', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
    },
    extractedText: { type: String }, // النص الكامل بعد الاستخراج (اختياري نحتفظ بيه للمراجعة)
    errorMessage: { type: String },
    chunksCount: { type: Number, default: 0 },

    // تتبع مصدر المستند لو جاي من الـ Medical History بتاع الباك اند الرئيسي
    // (بدل رفع منفصل) - بيمنعنا نعالج نفس المستند مرتين
    sourceRecordId: { type: String, index: true },
    sourceUrl: { type: String },
    diseaseContext: { type: String }, // اسم فولدر المرض اللي المستند تابع له
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
