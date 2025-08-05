const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const Agent = require('../models/Agent');

const SECRET_KEY = "agent_secret_key";

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const agent = await Agent.findOne({ where: { username } });
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    // Generate token
    const token = jwt.sign({ id: agent.id, username: agent.username }, SECRET_KEY, { expiresIn: "1d" });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;