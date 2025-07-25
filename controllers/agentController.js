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
exports.getDepositRequests = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM deposits ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error fetching deposits", details: err.message });
  }
};

exports.approveDeposit = async (req, res) => {
  const { id } = req.body;
  try {
    await db.query("UPDATE deposits SET status = 'Approved' WHERE id = $1", [id]);
    res.json({ message: "Deposit approved successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve deposit", details: err.message });
  }
};

exports.rejectDeposit = async (req, res) => {
  const { id } = req.body;
  try {
    await db.query("UPDATE deposits SET status = 'Rejected' WHERE id = $1", [id]);
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
    const result = await db.query("SELECT * FROM cashouts ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error fetching cashouts", details: err.message });
  }
};

exports.approveCashout = (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ error: "Upload failed", details: err.message });
    }

    const { id } = req.body;
    const receiptUrl = req.file ?` /uploads/agent-receipts/${req.file.filename}` : null;

    try {
      await db.query(
        "UPDATE cashouts SET status = 'Approved', receipt_url = $1 WHERE id = $2",
        [receiptUrl, id]
      );
      res.json({ message: "Cashout approved successfully", receiptUrl });
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