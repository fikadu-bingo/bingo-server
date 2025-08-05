const jwt = require("jsonwebtoken");

// Use environment variable or fallback to default secret key
const SECRET_KEY = process.env.AGENT_SECRET_KEY || "agent_secret_key";

module.exports = function (req, res, next) {
  const authHeader = req.headers["authorization"];

  // Check if authHeader exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided or bad format" });
  }

  const token = authHeader.split(" ")[1]; // Extract token

  if (!token) {
    return res.status(401).json({ error: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.agent = decoded; // Attach decoded info for downstream handlers
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};