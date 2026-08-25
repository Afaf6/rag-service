const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10) || 800; // حروف تقريباً
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP, 10) || 150;

/**
 * تقسيم النص لقطع بحجم ثابت مع تداخل (overlap) عشان السياق ميضيعش
 * على حدود القطع. بسيط وكافي لحجم بروجيكت تخرج، مش محتاجين
 * مكتبة chunking معقدة.
 */
function chunkText(text) {
  const chunks = [];
  if (!text || text.length === 0) return chunks;

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 20) {
      // نتجاهل القطع الصغيرة جداً (زي أسطر فاضية أو نويز)
      chunks.push(chunk);
    }
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

module.exports = chunkText;
