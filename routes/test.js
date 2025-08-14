// routes/test.js
const express = require('express');
const router = express.Router();
const { Agent } = require('../models');

router.get('/test-db', async (req, res) => {
  try {
    const agents = await Agent.findAll();
    res.json({ count: agents.length, agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;