// routes/admin.js (or user.js or agent.js depending on your structure)
const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const bcrypt = require('bcrypt');

router.post('/agent', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check if username exists
    const existingAgent = await Agent.findOne({ where: { username } });
    if (existingAgent) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await Agent.create({
      username,
      password: hashedPassword,
    });

    res.status(201).json({ message: 'Agent created successfully', agent: { id: newAgent.id, username: newAgent.username } });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;