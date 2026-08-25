const {
  answerPatientQuestion,
  getChatHistory,
} = require('../services/ragService');

const askQuestion = async (req, res) => {
  try {
    const { question } = req.body || {};

    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        error: 'Question is required',
      });
    }

    const patientId = req.patientId;

    if (!patientId) {
      return res.status(401).json({
        error: 'Patient identity not found',
      });
    }

    const result = await answerPatientQuestion(
      patientId,
      question
    );

    return res.status(200).json(result);

  } catch (error) {
    console.error('Chat error:', error);

    return res.status(500).json({
      error: 'An error occurred while processing the question',
      details: error.message,
    });
  }
};

// GET /api/chat/history
const getHistory = async (req, res) => {
  try {
    if (!req.patientId) {
      return res.status(401).json({ error: 'Patient identity not found' });
    }
    const messages = await getChatHistory(req.patientId);
    return res.json({ messages });
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ error: 'Could not load chat history', details: err.message });
  }
};

module.exports = { askQuestion, getHistory };