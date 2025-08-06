// controllers/promocodeController.js
const Promocode = require('../models/promocode');

// Create a new promo code
exports.createPromocode = async (req, res) => {
  try {
    const { code, commission } = req.body;

    if (!code || !commission) {
      return res.status(400).json({ error: 'Code and commission are required' });
    }

    // Normalize code to lowercase
    const normalizedCode = code.toLowerCase();

    // Check if promo code already exists
    const existing = await Promocode.findOne({ where: { code: normalizedCode } });
    if (existing) {
      return res.status(400).json({ error: 'Promo code already exists' });
    }

    // Create new promo code
    const promo = await Promocode.create({
      code: normalizedCode,
      commission,
    });

    res.status(201).json({ message: 'Promo code created successfully', promo });
  } catch (error) {
    console.error('Create promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Optional: get all promo codes
exports.getPromocodes = async (req, res) => {
  try {
    const promos = await Promocode.findAll();
    res.json({ promocodes: promos });
  } catch (error) {
    console.error('Get promo codes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};