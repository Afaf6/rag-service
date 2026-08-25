const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

/**
 * بياخد مسار الملف ونوعه ويرجع النص المستخرج منه كـ string واحد.
 */
async function extractText(filePath, fileType) {
  switch (fileType) {
    case 'pdf': {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return cleanText(data.text);
    }

    case 'docx': {
      const result = await mammoth.extractRawText({ path: filePath });
      return cleanText(result.value);
    }

    case 'image': {
      // OCR - بيدعم عربي وإنجليزي عشان الروشيتات ممكن تكون بأي لغة
      const {
        data: { text },
      } = await Tesseract.recognize(filePath, 'ara+eng');
      return cleanText(text);
    }

    default:
      throw new Error(`نوع ملف غير مدعوم: ${fileType}`);
  }
}

function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = extractText;
