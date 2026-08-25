/**
 * سكريبت اختباري بس - يولّد JWT لمريض وهمي عشان تقدر تختبر الـ API
 * من غير ما تشغل الباك اند الرئيسي بتاع البروجيكت.
 *
 * تشغيل: node scripts/generateTestToken.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const fakePatientId = '507f1f77bcf86cd799439011'; // أي ObjectId شكلي، بس ثابت عشان تعرف تتبع بياناته

const token = jwt.sign(
  { id: fakePatientId, role: 'patient' },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

console.log('Patient ID:', fakePatientId);
console.log('\nToken:\n', token);
console.log('\nمثال استخدام في curl:');
console.log(`\nAuthorization: Bearer ${token}`);
