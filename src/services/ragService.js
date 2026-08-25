const Chunk = require('../models/Chunk');
const ChatMessage = require('../models/ChatMessage');

const {
  embedSingleText,
  cosineSimilarity,
} = require('../utils/embeddings');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CHAT_MODEL =
  process.env.CHAT_MODEL || 'gemini-3.6-flash';

const TOP_K =
  parseInt(process.env.TOP_K_RESULTS, 10) || 5;

/*
 * We don't rely only on semantic similarity.
 * Medical reports contain important exact terms such as:
 * Hemoglobin, WBC, Platelets, Glucose, etc.
 */
const MIN_SEMANTIC_SIMILARITY = 0.10;
const MIN_HYBRID_SCORE = 0.10;

/**
 * Detect question language.
 */
function detectLanguage(text) {
  const arabicPattern = /[\u0600-\u06FF]/;
  return arabicPattern.test(text) ? 'ar' : 'en';
}

/**
 * Normalize text for keyword matching.
 */
function normalizeText(text) {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%./-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize text.
 */
function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter((word) => word.length >= 2);
}

/**
 * Calculate lexical overlap between question and chunk.
 *
 * This is useful for medical terms such as:
 * hemoglobin, glucose, platelets, WBC, cholesterol, etc.
 */
function lexicalScore(question, chunkText) {
  const questionTokens = tokenize(question);
  const chunkTokens = new Set(tokenize(chunkText));

  if (questionTokens.length === 0 || chunkTokens.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of questionTokens) {
    if (chunkTokens.has(token)) {
      matches++;
    }
  }

  return matches / questionTokens.length;
}

/**
 * Build system prompt.
 */
function buildSystemPrompt(lang) {
  if (lang === 'ar') {
    return `
أنت مساعد طبي ذكي يساعد المريض في فهم المستندات الطبية التي قام برفعها.

قواعد مهمة جدًا:

- أجب باللغة العربية فقط.
- استخدم فقط المعلومات الموجودة في المستندات الموجودة في السياق.
- لا تخترع أي معلومات غير موجودة في السياق.
- إذا لم تجد إجابة السؤال في المستندات، قل بوضوح إن المعلومات غير موجودة في المستندات المرفوعة.
- لا تقدم تشخيصًا طبيًا.
- لا تخترع نتائج تحاليل أو أدوية أو جرعات.
- عند تحليل نتائج التحاليل، قارن قيمة النتيجة بالـ Reference Range الموجود في المستند.
- إذا كانت نتيجة معينة خارج الـ Reference Range، اذكر ذلك بوضوح.
- لا تعتمد فقط على كلمة Normal أو Abnormal الموجودة في التقرير.
- إذا كانت المعلومة موجودة في السياق، اذكر القيمة كما ظهرت في التقرير.
- لا تستنتج قيمة غير موجودة بشكل صريح.
- كن واضحًا ومباشرًا ومختصرًا.
- لا تستخدم أي رموز تنسيق مثل النجمة (**) أو الشرطة (-) أو عناوين Markdown في ردك. اكتب نصًا عاديًا بالكامل، وافصل بين النقاط بأرقام عادية (1. 2. 3.) أو بفقرات منفصلة فقط.
`;
  }

  return `
You are a medical document assistant helping a patient understand their uploaded medical documents.

Important rules:

- Answer in English only.
- Use ONLY information contained in the provided document context.
- Do not invent or assume information that is not present in the context.
- If the answer cannot be found in the uploaded documents, clearly say that the information is not available in the uploaded documents.
- Do not diagnose the patient.
- Do not invent test results, medications, or dosages.
- When analyzing laboratory results, compare the reported result with the reference range provided in the document.
- If a result is outside the reference range, clearly mention that.
- Do not rely only on a Normal or Abnormal label.
- If a requested value is explicitly present in the provided context, return that value exactly as shown in the document.
- Never estimate or guess a medical value that is not explicitly present.
- Be clear, direct, and concise.
- Do not use any Markdown formatting such as asterisks (**), dashes (-), or headers in your response. Write plain text only, and separate points using plain numbers (1. 2. 3.) or separate paragraphs only.
`;
}

/**
 * Answer patient's question using RAG.
 */
async function answerPatientQuestion(patientId, question) {
  // --------------------------------------------------
  // 1. Detect language
  // --------------------------------------------------

  const lang = detectLanguage(question);

  // --------------------------------------------------
  // 2. Save patient question
  // --------------------------------------------------

  await ChatMessage.create({
    patientId,
    role: 'patient',
    text: question,
  });

  // --------------------------------------------------
  // 3. Get patient's chunks only
  // --------------------------------------------------

  const patientChunks = await Chunk.find({
    patientId,
  }).lean();

  if (patientChunks.length === 0) {
    const fallbackAnswer =
      lang === 'ar'
        ? 'لا توجد مستندات طبية مرفوعة حتى الآن. يرجى رفع التحاليل أو التقارير الطبية أولًا.'
        : 'No medical documents have been uploaded yet. Please upload your medical reports or lab results first.';

    await ChatMessage.create({
      patientId,
      role: 'assistant',
      text: fallbackAnswer,
    });

    return {
      answer: fallbackAnswer,
      sources: [],
    };
  }

  // --------------------------------------------------
  // 4. Generate question embedding
  // --------------------------------------------------

  const questionEmbedding =
    await embedSingleText(question);

  // --------------------------------------------------
  // 5. Score chunks
  //
  // We use BOTH:
  // - Semantic similarity
  // - Lexical keyword matching
  // --------------------------------------------------

  const scored = patientChunks
    .filter(
      (chunk) =>
        Array.isArray(chunk.embedding) &&
        chunk.embedding.length === questionEmbedding.length &&
        typeof chunk.text === 'string' &&
        chunk.text.trim().length > 0
    )
    .map((chunk) => {
      const semanticScore = cosineSimilarity(
        questionEmbedding,
        chunk.embedding
      );

      const lexical = lexicalScore(
        question,
        chunk.text
      );

      /*
       * Hybrid score:
       *
       * 70% semantic similarity
       * 30% keyword matching
       *
       * Keyword matching is particularly useful
       * for exact medical test names.
       */
      const hybridScore =
        semanticScore * 0.7 +
        lexical * 0.3;

      return {
        ...chunk,
        semanticScore,
        lexicalScore: lexical,
        score: hybridScore,
      };
    });

  // --------------------------------------------------
  // 6. Sort by hybrid score
  // --------------------------------------------------

  scored.sort((a, b) => b.score - a.score);

  // --------------------------------------------------
  // 7. Debug information
  // --------------------------------------------------

  console.log(
    '================ RAG DEBUG ================'
  );

  console.log(
    'Patient ID:',
    patientId
  );

  console.log(
    'Question:',
    question
  );

  console.log(
    'Total patient chunks:',
    patientChunks.length
  );

  console.log(
    'Question embedding dimensions:',
    questionEmbedding.length
  );

  console.log(
    'Compatible chunks:',
    scored.length
  );

  console.log(
    'Chunk information:',
    patientChunks.map((chunk) => ({
      id: chunk._id,
      filename:
        chunk.metadata?.originalFilename ||
        'Unknown',
      textLength:
        typeof chunk.text === 'string'
          ? chunk.text.length
          : 0,
      embeddingDimensions:
        Array.isArray(chunk.embedding)
          ? chunk.embedding.length
          : 'NO EMBEDDING',
    }))
  );

  console.log(
    'Top scored chunks:',
    scored.slice(0, 10).map((chunk) => ({
      id: chunk._id,
      filename:
        chunk.metadata?.originalFilename ||
        'Unknown',
      semanticScore:
        Number(chunk.semanticScore.toFixed(4)),
      lexicalScore:
        Number(chunk.lexicalScore.toFixed(4)),
      hybridScore:
        Number(chunk.score.toFixed(4)),
    }))
  );

  // --------------------------------------------------
  // 8. Select relevant chunks
  // --------------------------------------------------

  const topChunks = scored
    .filter((chunk) => {
      /*
       * Accept a chunk when:
       *
       * 1. Semantic similarity is reasonably good
       *
       * OR
       *
       * 2. The question has exact keywords
       *    that appear in the medical document.
       *
       * This is useful for questions like:
       * "What is my hemoglobin level?"
       */
      const semanticMatch =
        chunk.semanticScore >=
        MIN_SEMANTIC_SIMILARITY;

      const keywordMatch =
        chunk.lexicalScore > 0;

      const hybridMatch =
        chunk.score >= MIN_HYBRID_SCORE;

      return (
        (semanticMatch && hybridMatch) ||
        keywordMatch
      );
    })
    .slice(0, TOP_K);

  console.log(
    'Selected chunks:',
    topChunks.map((chunk) => ({
      id: chunk._id,
      filename:
        chunk.metadata?.originalFilename ||
        'Unknown',
      semanticScore:
        Number(chunk.semanticScore.toFixed(4)),
      lexicalScore:
        Number(chunk.lexicalScore.toFixed(4)),
      hybridScore:
        Number(chunk.score.toFixed(4)),
    }))
  );

  console.log(
    '============================================'
  );

  // --------------------------------------------------
  // 9. No relevant context
  // --------------------------------------------------

  if (topChunks.length === 0) {
    const fallbackAnswer =
      lang === 'ar'
        ? 'لم أجد معلومات كافية مرتبطة بسؤالك في المستندات الطبية المرفوعة.'
        : 'I could not find enough relevant information in your uploaded medical documents to answer this question.';

    await ChatMessage.create({
      patientId,
      role: 'assistant',
      text: fallbackAnswer,
    });

    return {
      answer: fallbackAnswer,
      sources: [],
    };
  }

  // --------------------------------------------------
  // 10. Build context
  // --------------------------------------------------

  const context = topChunks
    .map((chunk, index) => {
      const filename =
        chunk.metadata?.originalFilename ||
        'Unknown';

      if (lang === 'ar') {
        return `
[المصدر ${index + 1} - الملف: "${filename}"]

${chunk.text}
`;
      }

      return `
[Source ${index + 1} - File: "${filename}"]

${chunk.text}
`;
    })
    .join('\n\n--------------------\n\n');

  // --------------------------------------------------
  // 11. Build prompts
  // --------------------------------------------------

  const systemPrompt =
    buildSystemPrompt(lang);

  const userMessage =
    lang === 'ar'
      ? `
السياق من المستندات الطبية:

${context}

---

سؤال المريض:

${question}

---

أجب اعتمادًا فقط على السياق الموجود أعلاه.
`
      : `
Context from the patient's medical documents:

${context}

---

Patient question:

${question}

---

Answer using ONLY the medical document context provided above.
`;

  // --------------------------------------------------
  // 12. Validate API key
  // --------------------------------------------------

  if (!GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is missing from .env'
    );
  }

  // --------------------------------------------------
  // 13. Call Gemini
  // --------------------------------------------------

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`;

  const response = await fetch(
    geminiUrl,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },

        contents: [
          {
            role: 'user',
            parts: [
              {
                text: userMessage,
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.15,
        },
      }),
    }
  );

  // --------------------------------------------------
  // 14. Handle Gemini errors
  // --------------------------------------------------

  if (!response.ok) {
    const errText =
      await response.text();

    throw new Error(
      `Gemini API error (${response.status}): ${errText}`
    );
  }

  // --------------------------------------------------
  // 15. Parse Gemini response
  // --------------------------------------------------

  const data =
    await response.json();

  const answerText =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('') || '';

  if (!answerText) {
    throw new Error(
      'Gemini returned an empty response'
    );
  }

  // --------------------------------------------------
  // 16. Sources
  // --------------------------------------------------

  const sources = topChunks.map((chunk) => ({
    filename:
      chunk.metadata?.originalFilename ||
      'Unknown',

    similarity:
      Number(chunk.score.toFixed(3)),

    semanticSimilarity:
      Number(
        chunk.semanticScore.toFixed(3)
      ),

    keywordMatch:
      Number(
        chunk.lexicalScore.toFixed(3)
      ),

    excerpt:
      chunk.text.length > 150
        ? chunk.text.slice(0, 150) + '...'
        : chunk.text,
  }));

  // --------------------------------------------------
  // 17. Save assistant answer
  // --------------------------------------------------

  await ChatMessage.create({
    patientId,
    role: 'assistant',
    text: answerText,
    sources: sources.map((source) => ({
      filename: source.filename,
      similarity: source.similarity,
    })),
  });

  // --------------------------------------------------
  // 18. Return
  // --------------------------------------------------

  return {
    answer: answerText,
    sources,
  };
}

/**
 * Get patient's chat history.
 */
async function getChatHistory(patientId) {
  const messages =
    await ChatMessage.find({
      patientId,
    })
      .sort({ createdAt: 1 })
      .lean();

  return messages.map((message) => ({
    role: message.role,
    text: message.text,
    sources: message.sources,
    createdAt: message.createdAt,
  }));
}

module.exports = {
  answerPatientQuestion,
  getChatHistory,
};