const express = require("express");
const multer = require("multer");
const {
  telegramAuth,
  deposit,
  withdraw,
  transfer,
  getMe, // ✅ Added
} = require("../controllers/userController");

const { User } = require("../models");

const router = express.Router();

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.post("/telegram-auth", telegramAuth);
router.post("/deposit", upload.single("receipt"), deposit);
router.post("/withdraw", withdraw);
router.post("/transfer", transfer);

// ✅ Check if user exists by Telegram ID
router.get("/check/:telegram_id", async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const user = await User.findOne({ where: { telegram_id } });
    if (user) {
      res.status(200).json({ exists: true, user });
    } else {
      res.status(404).json({ exists: false });
    }
  } catch (error) {
    console.error("Check user error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Get username and profile picture for frontend HomePage
router.get("/me", getMe);

module.exports = router;