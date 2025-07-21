const express = require("express");
const multer = require("multer");
const {
  telegramAuth,
  deposit,
  withdraw,
  transfer
} = require("../controllers/userController");

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

module.exports = router;