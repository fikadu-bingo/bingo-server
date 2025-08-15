const { User, Deposit, Cashout } = require("../models");
const { v4: uuidv4 } = require("uuid");

// ==============================
// ✅ Telegram Authentication Handler (unchanged)
// ==============================
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

// ==============================
// ✅ Deposit Handler (updated to use receiptUrl from frontend)
// ==============================
exports.deposit = async (req, res) => {
  try {
    const { amount, phone, receiptUrl } = req.body; // ✅ receiptUrl instead of file
    const telegram_id = req.headers["telegram_id"];

    console.log("📥 Deposit request:", { amount, phone, telegram_id, receiptUrl });

    if (!amount || !phone || !receiptUrl) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let user = await User.findOne({ where: { telegram_id: String(telegram_id) } });
    if (!user) {
      user = await User.create({ telegram_id: String(telegram_id), balance: 0 });
      console.log("✅ New user created automatically:", user.id);
    }

    await Deposit.create({
      id: uuidv4(),
      user_id: user.id,
      amount: parseFloat(amount),
      phone_number: phone,
      receipt_url: receiptUrl, // ✅ save Cloudinary URL
      date: new Date(),
      status: "pending",
    });

    console.log("✅ Deposit successfully saved to DB");
    return res.status(201).json({ message: "Deposit request created" });
  } catch (error) {
    console.error("Deposit error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// ==============================
// ✅ Cashout Handler (updated to use receiptUrl from frontend)
// ==============================
exports.cashout = async (req, res) => {
  const { telegram_id, amount, phone_number, receiptUrl } = req.body; // ✅ receiptUrl added
  console.log("📥 Cashout request received:", { telegram_id, amount, phone_number, receiptUrl });

  if (!telegram_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  const t = await User.sequelize.transaction();

  try {
    const user = await User.findOne({ where: { telegram_id: String(telegram_id) }, transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.balance < amount) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Deduct balance
    user.balance -= amount;
    await user.save({ transaction: t });

    // Create cashout
    const cashout = await Cashout.create({
      user_id: user.id,
      phone_number: phone_number || user.phone_number,
      amount: parseFloat(amount),
      receipt: receiptUrl || "", // ✅ save Cloudinary URL if provided
      status: "pending",
      date: new Date(),
    }, { transaction: t });

    await t.commit();
    console.log("✅ Cashout created successfully:", cashout.toJSON());
    return res.status(200).json({
      success: true,
      message: "Withdrawal successful",
      balance: user.balance,
    });
  } catch (error) {
    await t.rollback();
    console.error("🔥 Cashout error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ==============================
// ✅ Transfer Handler (unchanged)
// ==============================
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
    await receiver.save();

    res.status(200).json({
      message: "Transfer successful",
      senderBalance: sender.balance,
      receiverBalance: receiver.balance,
    });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ==============================
// ✅ Get User Profile (for frontend HomePage)
// ==============================
exports.getMe = async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    return res.status(400).json({ message: "telegram_id is required" });
  }

  try {
    const user = await User.findOne({
      where: { telegram_id: String(telegram_id) },
      attributes: ["username", "profile_picture", "balance"],
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