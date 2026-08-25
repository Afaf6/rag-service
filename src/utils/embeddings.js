const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'gemini-embedding-001';

const EMBEDDING_DIMENSIONS = 768;

/**
 * Generate embeddings for multiple texts.
 */
async function embedTexts(texts) {
  if (!texts || texts.length === 0) {
    return [];
  }

  const embeddings = [];

  for (const text of texts) {
    const embedding = await embedSingleText(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Generate embedding for a single text using Gemini.
 */
async function embedSingleText(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from .env');
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${EMBEDDING_MODEL}:embedContent`;

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },

    body: JSON.stringify({
      content: {
        parts: [
          {
            text,
          },
        ],
      },

      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();

    throw new Error(
      `Failed to get embedding from Gemini: ${errText}`
    );
  }

  const data = await response.json();

  if (!data.embedding || !data.embedding.values) {
    throw new Error(
      `Gemini returned an invalid embedding response: ${JSON.stringify(data)}`
    );
  }

  return data.embedding.values;
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) {
    throw new Error('Invalid embedding vector');
  }

  if (vecA.length !== vecB.length) {
    throw new Error(
      `Embedding dimensions mismatch: ${vecA.length} vs ${vecB.length}`
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  embedTexts,
  embedSingleText,
  cosineSimilarity,
};