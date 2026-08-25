const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, index: true },
    role: { type: String, enum: ['patient', 'assistant'], required: true },
    text: { type: String, required: true },
    sources: [
      {
        filename: String,
        similarity: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
