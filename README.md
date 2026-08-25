# Patient RAG Microservice

A standalone microservice responsible for the patient-side Retrieval-Augmented Generation (RAG) functionality of the medical project.

Patients can upload their medical documents, such as prescriptions, laboratory reports, and medical images. The service processes these documents and allows patients to ask questions based on their uploaded medical information.

The service uses **Google Gemini** for both:
- Text embeddings
- AI response generation

MongoDB is used to store documents, extracted text, chunks, embeddings, and chat history.

---

## Features

- Upload medical documents
- Extract text from supported files
- Split extracted text into chunks
- Generate embeddings using Gemini
- Store document chunks and embeddings in MongoDB
- Retrieve the most relevant chunks using cosine similarity
- Generate answers using Gemini
- Support Arabic and English questions
- Patient data isolation using JWT authentication
- Store patient chat history
- Return the source documents used to generate an answer
- Delete uploaded documents and their associated chunks

---

## Technology Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- Google Gemini API
- JWT Authentication
- Multer
- PDF/Text extraction
- OCR for supported images
- Cosine Similarity
- Nodemon

---

## Environment Setup

Create a `.env` file based on `.env.example`.

Example:

```env
PORT=5050

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_shared_jwt_secret

GEMINI_API_KEY=your_gemini_api_key

EMBEDDING_MODEL=gemini-embedding-001

CHAT_MODEL=gemini-2.5-flash

TOP_K_RESULTS=5
