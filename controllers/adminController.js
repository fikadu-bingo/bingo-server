// controllers/adminController.js
const jwt = require("jsonwebtoken");
const SECRET_KEY = "admin_secret_key"; // move to env
const bcrypt = require("bcrypt");

exports.adminLogin = async (req, res) => {
  const { username, password } = req.body;

  // Example hardcoded admin — later store in DB
  const adminUsername = "admin";
  const adminPasswordHash = await bcrypt.hash("2468", 10);

  if (username !== adminUsername) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, adminPasswordHash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "2h" });
  res.json({ success: true, message: "Login successful", token });
};

// Example stats function
exports.getStats = async (req, res) => {
  try {
    // Later replace with DB queries
    const stats = {
      totalUsers: 150,
      totalDeposits: 5000,
      totalCashouts: 2000,
      promoters: 12,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Error fetching stats" });
  }
};