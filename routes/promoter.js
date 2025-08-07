// routes/promoter.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Promocode, User } = require('../models'); // Adjust if your user model is different

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Login: promoter enters their promo code only
router.post('/login', async (req, res) => {
  const { promo_code } = req.body;
  console.log('Received promo_code:', promo_code); // ✅ log received value

  if (!promo_code) {
    return res.status(400).json({ message: 'Promo code is required' });
  }

  try {
    const promo = await Promocode.findOne({ where: { code: promo_code } });
    console.log('Promo found:', promo); // ✅ log found promo

    if (!promo) {
      return res.status(401).json({ message: 'Invalid promo code' });
    }

    const token = jwt.sign({ id: promo.id, code: promo.code }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, code: promo.code });
  } catch (error) {
    console.error('Promoter login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get promoter commission info
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ message: 'No token provided' });

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const promo = await Promocode.findByPk(decoded.id);
    if (!promo) return res.status(404).json({ message: 'Promocode not found' });

    res.json({
      code: promo.code,
      balance: promo.balance,
      totalEarnings: promo.total_earnings,
    });
  } catch (error) {
    console.error('Get promoter info error:', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

module.exports = router;