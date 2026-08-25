require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const documentRoutes = require('./routes/documentRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

connectDB();

app.use(helmet());
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Parse form/url-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests, please try again later',
  },
});

app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    service: 'patient-rag-service',
  })
);

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    error: err.message || 'Server error',
  });
});

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  console.log(`🚀 Patient RAG service running on port ${PORT}`);
});