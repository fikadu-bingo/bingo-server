const express = require("express");
const multer = require("multer");
const {
  telegramAuth,
  deposit,
  transfer,
  getMe,
  cashout,
} = require("../controllers/userController");

const { User } = require("../models");
const cloudinary = require("../cloudinary"); // ✅ Cloudinary config

const router = express.Router();

// ------------------------------
// ✅ Multer setup (memory storage for Cloudinary)
// ------------------------------
const storageMemory = multer.memoryStorage(); // store files in memory
const uploadCloud = multer({ storage: storageMemory }); // Multer instance

// ------------------------------
// Routes
// ------------------------------

// Telegram login/auth
router.post("/telegram-auth", telegramAuth);

// ------------------------------
// Deposit route with receipt upload
// ------------------------------
// Frontend first uploads file to /upload-receipt
// Then sends deposit request with receiptUrl
router.post("/deposit", uploadCloud.single("receipt"), deposit);

// Transfer route
router.post("/transfer", transfer);

// ------------------------------
// Cashout route with optional receipt upload
// ------------------------------
// Frontend first uploads file to /upload-receipt (type=cashout)
// Then sends cashout request with receiptUrl
router.post("/cashout", cashout);

// ------------------------------
// ✅ Upload receipt to Cloudinary
// ------------------------------
router.post("/upload-receipt", uploadCloud.single("receipt"), async (req, res) => {
  try {
    const { type } = req.body;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Choose folder dynamically based on type
    const folder =
      type === "deposit"
        ? "bingo_deposit_receipts"
        : type === "cashout"
        ? "bingo_cashout_receipts"
        : "bingo_other_receipts";

    // Upload to Cloudinary via stream
    cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return res.status(500).json({ message: "Upload failed", error: err });
      res.json({ url: result.secure_url }); // ✅ Return URL to frontend
    }).end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ------------------------------
// Check if user exists by Telegram ID
// ------------------------------
router.get("/check/:telegram_id", async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const user = await User.findOne({ where: { telegram_id } });
    if (user) {
      res.status(200).json({ exists: true, user });
    } else {
      res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("Check user error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ------------------------------
// Get username & profile picture for frontend HomePage
// ------------------------------
router.get("/me", getMe);

module.exports = router;