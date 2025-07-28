const { User, Deposit } = require("../models");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

// ✅ Telegram Authentication Handler
exports.telegramAuth = async (req, res) => {
  const { telegram_id, phone_number, username, profile_picture } = req.body;

  if (!telegram_id || !phone_number) {
    return res.status(400).json({ message: "telegram_id and phone_number are required." });
  }

  try {
    const stringTelegramId = String(telegram_id);

    let user = await User.findOne({ where: { telegram_id: stringTelegramId } });

    if (user) {
      return res.status(200).json({ message: "Login successful", user });
    } else {
      const newUser = await User.create({
        id: uuidv4(),
        telegram_id: stringTelegramId,
        phone_number,
        username: username || `TG_${stringTelegramId}`,
        profile_picture: profile_picture || null,
        balance: 0,
      });

      return res.status(201).json({ message: "User registered", user: newUser });
    }
  } catch (error) {
    console.error("Telegram auth error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// ✅ Deposit Handler with File Upload
exports.deposit = async (req, res) => {
  try {
    const { amount, phone } = req.body;
    const receipt = req.file;

    if (!amount || !phone || !receipt) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const telegram_id = req.headers["telegram-id"];
    if (!telegram_id) {
      return res.status(400).json({ message: "Missing telegram_id in header" });
    }

    const user = await User.findOne({ where: { telegram_id: String(telegram_id) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const receiptPath = `/uploads/receipts/${receipt.filename}`;

    await Deposit.create({
      id: uuidv4(),
      user_id: user.id,
      amount: parseFloat(amount),
      phone_number: phone,
      receipt_url: receiptPath,
      date: new Date(),
      status: "pending",
    });

    return res.status(201).json({ message: "Deposit request created" });
  } catch (error) {
    console.error("Deposit error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// ✅ Withdraw Handler
exports.withdraw = async (req, res) => {
  const { telegram_id, amount } = req.body;

  if (!telegram_id || !amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const user = await User.findOne({ where: { telegram_id: String(telegram_id) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    user.balance -= amount;
    await user.save();

    res.status(200).json({ message: "Withdrawal successful", balance: user.balance });
  } catch (error) {
    console.error("Withdraw error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Transfer Handler
exports.transfer = async (req, res) => {
  const { from_telegram_id, to_telegram_id, amount } = req.body;

  if (!from_telegram_id || !to_telegram_id || !amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const sender = await User.findOne({ where: { telegram_id: String(from_telegram_id) } });
    const receiver = await User.findOne({ where: { telegram_id: String(to_telegram_id) } });

    if (!sender || !receiver) {
      return res.status(404).json({ message: "Sender or receiver not found" });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save();
    await receiver.save();res.status(200).json({
      message: "Transfer successful",
      senderBalance: sender.balance,
      receiverBalance: receiver.balance,
    });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Get User Profile (for Frontend HomePage)
exports.getMe = async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ message: "telegram_id is required" });
  }

  try {
    const user = await User.findOne({
      where: { telegram_id: String(telegram_id) },
      attributes: ["username", "profile_picture"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("getMe error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};