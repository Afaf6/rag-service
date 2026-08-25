# Patient RAG Microservice

سيرفس مستقل (standalone) للجزء الخاص بالمريض في البروجيكت الطبي.
المريض بيرفع مستنداته (روشيتات / تحاليل / أشعة) والسيرفس بيرد على أسئلته بناءً على مستنداته هو فقط.

## التشغيل

```bash
# لازم Ollama شغال قبل ما تشغلي السيرفس
ollama pull nomic-embed-text
ollama pull llama3.1
ollama serve

# في terminal تاني
cd rag-service
npm install
cp .env.example .env   # عدّلي DB_URL و JWT_SECRET لو محتاجة
npm run dev
```

## الفكرة العامة (Pipeline)

**رفع ملف:**
`Upload → extractText (pdf-parse / mammoth / tesseract OCR) → chunker → Ollama embeddings (nomic-embed-text) → حفظ في Chunk collection`

**سؤال المريض:**
`Question → embedding → cosine similarity على chunks المريض فقط → بناء context → Ollama chat (llama3.1) → رد`

كل الاتصال بـ Ollama بيحصل محلياً على `http://localhost:11434` — مفيش API keys ولا فلوس.

## الـ Endpoints

كل الـ endpoints محتاجة `Authorization: Bearer <JWT>` بنفس الـ secret المستخدم في الباك اند الرئيسي.

| Method | Endpoint              | الوظيفة                          |
|--------|------------------------|-----------------------------------|
| POST   | `/api/documents/upload`| رفع ملف (form-data: `file`, `category`) |
| GET    | `/api/documents`       | عرض مستندات المريض                |
| DELETE | `/api/documents/:id`   | حذف مستند ومحتواه                 |
| POST   | `/api/chat/ask`        | سؤال (`{ "question": "..." }`)    |
| GET    | `/health`              | فحص حالة السيرفس                  |

## عزل بيانات المرضى

كل query على `Chunk` و `Document` بيتفلتر بـ `patientId` المستخرج من التوكين
(`req.patientId` في middleware `auth.js`) - مفيش أي endpoint بياخد `patientId` من الـ body أو الـ params.

## التكامل مع البروجيكت الرئيسي

- شغّاله على port منفصل (افتراضي 5050)
- الفرونت بيكلمه مباشرة، أو ممكن تعمل proxy/route من الباك اند الرئيسي
- نفس `JWT_SECRET` لازم يتشارك بين السيرفيسين عشان التوكين يفضل صالح
- ممكن يستخدم نفس MongoDB cluster بس بقاعدة بيانات أو collections منفصلة

## ملاحظة للـ scale لاحقاً

الـ similarity search دلوقتي بيتحسب يدوياً في الكود (cosine similarity على كل chunks المريض).
كافي جداً لعدد صفحات محدود (مشروع تخرج). لو الداتا كبرت كتير، انقل الـ vector search
لـ MongoDB Atlas Vector Search بدل الحساب اليدوي.
