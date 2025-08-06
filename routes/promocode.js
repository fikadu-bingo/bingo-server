// routes/promocode.js
const express = require('express');
const router = express.Router();
const promocodeController = require('../controllers/promocodeController');

// Create a new promo code
router.post('/', promocodeController.createPromocode);

// Get all promo codes (optional)
router.get('/', promocodeController.getPromocodes);

module.exports = router;