// userController.js

const { User, Deposit, Cashout } = require("../models"); // adjust if your models are in a different folder
const cloudinary = require("../cloudinary"); // make sure cloudinary.js is in the correct path

// ==========================
// Create Deposit Request
// ==========================
exports.deposit = async (req, res) => {
  try {
    const { amount, phone } = req.body;

    // Check if a receipt file is uploaded
    let receiptUrl = "";
    if (req.files?.receipt) {
      const file = req.files.receipt;
      const uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "bingo_deposit_receipts",
      });
      receiptUrl = uploaded.secure_url; // full Cloudinary URL
    }

    // Save deposit in DB
    const deposit = await Deposit.create({
      user_id: req.user.id,
      amount,
      phone,
      receipt_url: receiptUrl,
      status: "pending",
    });

    res.status(201).json({ message: "Deposit request created", deposit });
  } catch (error) {
    console.error("Deposit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================
// Create Cashout Request
// ==========================
exports.cashout = async (req, res) => {
  try {
    const { amount, phone } = req.body;

    // Check if a receipt file is uploaded
    let receiptUrl = "";
    if (req.files?.receipt) {
      const file = req.files.receipt;
      const uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "bingo_cashout_receipts",
      });
      receiptUrl = uploaded.secure_url; // full Cloudinary URL
    }

    // Save cashout in DB
    const cashout = await Cashout.create({
      user_id: req.user.id,
      amount,
      phone,
      receipt: receiptUrl,
      status: "pending",
    });

    res.status(201).json({ message: "Cashout request created", cashout });
  } catch (error) {
    console.error("Cashout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================
// Approve Deposit (Agent)
// ==========================
exports.approveDeposit = async (req, res) => {
  try {
    const { depositId } = req.body;
    const deposit = await Deposit.findByPk(depositId);

    if (!deposit) return res.status(404).json({ error: "Deposit not found" });

    deposit.status = "approved";
    await deposit.save();

    res.json({ message: "Deposit approved", deposit });
  } catch (error) {
    console.error("Approve deposit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================
// Approve Cashout (Agent)
// ==========================
exports.approveCashout = async (req, res) => {
  try {
    const { cashoutId } = req.body;
    const cashout = await Cashout.findByPk(cashoutId);

    if (!cashout) return res.status(404).json({ error: "Cashout not found" });

    // If agent uploads a receipt proof for cashout
    if (req.files?.receipt) {
      const file = req.files.receipt;
      const uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: "agent_cashout_receipts",
      });
      cashout.receipt = uploaded.secure_url;
    }

    cashout.status = "approved";
    await cashout.save();

    res.json({ message: "Cashout approved", cashout });
  } catch (error) {
    console.error("Approve cashout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================
// Reject Deposit (Agent)
// ==========================
exports.rejectDeposit = async (req, res) => {
  try {
    const { depositId } = req.body;
    const deposit = await Deposit.findByPk(depositId);

    if (!deposit) return res.status(404).json({ error: "Deposit not found" });

    deposit.status = "rejected";
    await deposit.save();

    res.json({ message: "Deposit rejected", deposit });
  } catch (error) {
    console.error("Reject deposit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// ==========================
// Reject Cashout (Agent)
// ==========================
exports.rejectCashout = async (req, res) => {
  try {
    const { cashoutId } = req.body;
    const cashout = await Cashout.findByPk(cashoutId);

    if (!cashout) return res.status(404).json({ error: "Cashout not found" });

    cashout.status = "rejected";
    await cashout.save();

    res.json({ message: "Cashout rejected", cashout });
  } catch (error) {
    console.error("Reject cashout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};