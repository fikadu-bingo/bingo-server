// controllers/agentController.js

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
const User = require("../models/user");

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
          attributes: ["username"], // get only username from User
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

  try {
    const result = await db.query('SELECT amount, user_id FROM "Deposits" WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Deposit not found" });

    const { amount, user_id } = result.rows[0];

    await db.query('UPDATE "Deposits" SET status = $1 WHERE id = $2', ['Approved', id]);
    await db.query('UPDATE "Users" SET balance = balance + $1 WHERE id = $2', [amount, user_id]);

    res.json({ message: "Deposit approved and balance updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve deposit", details: err.message });
  }
};

exports.rejectDeposit = async (req, res) => {
  const { id } = req.body;
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
    const [cashouts] = await db.query('SELECT * FROM cashouts ORDER BY date DESC');
    console.log("Cashouts fetched:", cashouts); // ✅ Should log actual rows now
    res.json({ cashouts });
  } catch (err) {
    console.error("Cashout error:", err);
    res.status(500).json({ error: "Error fetching cashouts", details: err.message });
  }
};

exports.approveCashout = (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: "Upload failed", details: err.message });
    }

    const { id } = req.body;
    const receiptUrl = req.file ? `/uploads/agent-receipts/${req.file.filename}` : null;

    try {
      const result = await db.query("SELECT amount, user_id FROM cashouts WHERE id = $1", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Cashout not found" });

      const { amount, user_id } = result.rows[0];

      await db.query(
        "UPDATE cashouts SET status = 'Approved', receipt_url = $1 WHERE id = $2",
        [receiptUrl, id]
      );

      await db.query('UPDATE "Users" SET balance = balance - $1 WHERE id = $2', [amount, user_id]);

      res.json({ message: "Cashout approved and balance updated", receiptUrl });
    } catch (err) {
      res.status(500).json({ error: "Failed to approve cashout", details: err.message });
    }
  });
};
exports.rejectCashout = async (req, res) => {
  const { id } = req.body;
  try {
    await db.query("UPDATE cashouts SET status = 'Rejected' WHERE id = $1", [id]);
    res.json({ message: "Cashout rejected successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject cashout", details: err.message });
  }
};
