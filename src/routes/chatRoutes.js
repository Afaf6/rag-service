const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { askQuestion, getHistory } = require('../controllers/chatController');

router.use(authenticate);

router.post('/ask', askQuestion);
router.get('/history', getHistory);

module.exports = router;
