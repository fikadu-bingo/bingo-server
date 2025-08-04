// controllers/agentController.js
const { Cashout, User } = require("../models"); // Adjust path if needed
const db = require("../config/db"); // PostgreSQL connection
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ---------------------------
// Multer setup for receipt upload
// ---------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/agent-receipts";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, `receipt-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage }).single("receipt");

// ---------------------------
// Agent Login (Optional Basic)
// ---------------------------
exports.agentLogin = async (req, res) => {
  const { username, password } = req.body;

  if (username === "agent" && password === "1234") {
    res.json({ success: true, message: "Login successful" });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
};

// ---------------------------
// Deposit Requests
// ---------------------------
const Deposit = require("../models/deposit");


// Define association (if not already done somewhere central)
Deposit.belongsTo(User, { foreignKey: "user_id" });

exports.getDepositRequests = async (req, res) => {
  try {
    const deposits = await Deposit.findAll({
      where: { status: "pending" },
      order: [["date", "DESC"]],
      include: [
        {
          model: User,
          attributes: ["username","phone_number"], // get only username from User
        },
      ],
    });

    // Format response with user info merged
    const formattedDeposits = deposits.map((dep) => ({
      id: dep.id,
      amount: dep.amount,
      phone_number: dep.phone_number,
      receipt_url: dep.receipt_url,
      status: dep.status,
      date: dep.date,
      username: dep.User ? dep.User.username : null,
    }));

    res.status(200).json({ deposits: formattedDeposits });
  } catch (err) {
    res.status(500).json({ error: "Error fetching deposits", details: err.message });
  }
};

exports.approveDeposit = async (req, res) => {
  const { id } = req.params;
  console.log("🔧 Approving deposit ID:", id);

  try {
    const result = await db.query(
      'SELECT amount, user_id FROM "Deposits" WHERE id = :id',
      {
        replacements: { id },
        type: db.QueryTypes.SELECT,
      }
    );

    if (result.length === 0) {
      console.log("❌ Deposit not found for ID:", id);
      return res.status(404).json({ error: "Deposit not found" });
    }

    const { amount, user_id } = result[0];

    await db.query(
      'UPDATE "Deposits" SET status = :status WHERE id = :id',
      {
        replacements: { status: 'Approved', id },
        type: db.QueryTypes.UPDATE,
      }
    );

    await db.query(
      'UPDATE "Users" SET balance = balance + :amount WHERE id = :user_id',
      {
        replacements: { amount, user_id },
        type: db.QueryTypes.UPDATE,
      }
    );

    console.log("✅ Deposit approved and balance updated");
    res.json({ message: "Deposit approved and balance updated" });
  } catch (err) {
    console.error("🔥 Error approving deposit:", err.message);
    res.status(500).json({ error: "Failed to approve deposit", details: err.message });
  }
};

exports.rejectDeposit = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE "Deposits" SET status = $1 WHERE id = $2', ['Rejected', id]);
    res.json({ message: "Deposit rejected successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject deposit", details: err.message });
  }
};

// ---------------------------
// Cashout Requests
// ---------------------------
exports.getCashoutRequests = async (req, res) => {
  try {
    const [cashouts] = await db.query(`
      SELECT 
        c.*, 
        u.username, 
        u.phone_number 
      FROM cashouts c
      JOIN "Users" u ON c.user_id = u.id
      ORDER BY c.date DESC
    `);

    res.json({ cashouts });
  } catch (err) {
    console.error("Cashout error:", err);
    res.status(500).json({ error: "Error fetching cashouts", details: err.message });
  }
};

exports.approveCashout = async (req, res) => {
  const { id } = req.params;

  console.log("📩 Received approveCashout request for ID:", id);

  if (!req.file) {
    console.log("❌ No receipt file uploaded");
    return res.status(400).json({ error: "Receipt file is required" });
  }

  const receiptUrl = `/uploads/agent-receipts/${req.file.filename}`;
  console.log("📄 Receipt will be saved at:", receiptUrl);

  try {
    // 1. Find cashout
    const cashout = await Cashout.findByPk(id);
    if (!cashout) {
      console.log("❌ Cashout not found");
      return res.status(404).json({ error: "Cashout not found" });
    }

    // 2. Find user
    const user = await User.findByPk(cashout.user_id);
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ error: "User not found" });
    }

    // 3. Update cashout status and receipt
    await cashout.update({
      status: "Approved",
      receipt_url: receiptUrl,
    });

    // 4. Deduct user balance
    user.balance -= cashout.amount;
    await user.save();

    console.log("✅ Cashout approved and balance updated");

    return res.json({
      message: "Cashout approved and balance updated",
      receiptUrl,
    });
  } catch (err) {
    console.error("🔥 Error during approveCashout:", err.message);
    return res.status(500).json({
      error: "Failed to approve cashout",
      details: err.message,
    });
  }
};
exports.rejectCashout = async (req, res) => {
  const { id } = req.params;
  try {
    const cashout = await Cashout.findByPk(id);
if (!cashout) {
  return res.status(404).json({ error: "Cashout not found" });
}
await cashout.update({ status: "Rejected" });
    res.json({ message: "Cashout rejected successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject cashout", details: err.message });
  }
};