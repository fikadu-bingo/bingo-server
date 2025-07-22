const express = require("express");
const multer = require("multer");
const {
  telegramAuth,
  deposit,
  withdraw,
  transfer,
} = require("../controllers/userController");

const { User } = require("../models"); // ✅ Import User model

const router = express.Router();

// Configure Multer for file uploads
const storage = multer.memoryStorage(); // or use diskStorage if saving to disk
const upload = multer({ storage });

// Routes
router.post("/telegram-auth", telegramAuth);

// If receipt is uploaded, expect receipt field from form-data
router.post("/deposit", upload.single("receipt"), deposit);

router.post("/withdraw", withdraw);
router.post("/transfer", transfer);

// ✅ Check if user exists by Telegram ID (for one-time phone request)
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

module.exports = router;