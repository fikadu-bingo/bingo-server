const multer = require("multer");
const path = require("path");

// Set up disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/receipts");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Optional file filter for images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only jpeg, jpg, png, and pdf files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

module.exports = upload;