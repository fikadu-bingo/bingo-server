const express = require("express");
const { telegramAuth, deposit, withdraw, transfer } = require("../controllers/userController");
const router = express.Router();

router.post("/telegram-auth", telegramAuth);
router.post("/deposit", deposit);
router.post("/withdraw", withdraw);
router.post("/transfer", transfer);

module.exports = router;