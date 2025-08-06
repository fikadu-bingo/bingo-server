const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const PromoCode = require('../models/promocode');
const bcrypt = require('bcrypt');

// Route to create an agent
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

// Route to create a promo code
router.post('/promocode', async (req, res) => {
  try {
    const { code, commission } = req.body;

    if (!code || commission == null) {
      return res.status(400).json({ error: 'Code and commission are required' });
    }

    // Check if promo code already exists
    const existingCode = await PromoCode.findOne({ where: { code } });
    if (existingCode) {
      return res.status(400).json({ error: 'Promo code already exists' });
    }

    const newPromo = await PromoCode.create({
      code,
      commission,
    });

    res.status(201).json({ message: 'Promo code created successfully', promoCode: newPromo });
  } catch (error) {
    console.error('Create promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;