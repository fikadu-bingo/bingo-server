// middleware/upload.js
const multer = require("multer");
const cloudinary = require("../cloudinary"); // ✅ new: Cloudinary config
const { Readable } = require("stream");

// ------------------------------
// Multer memory storage instead of disk storage
// ------------------------------
// Reason: We upload files directly to Cloudinary, no local storage needed
const storage = multer.memoryStorage();

// Optional file filter for images and PDFs (kept from old code)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only jpeg, jpg, png, and pdf files are allowed"), false);
  }
};

const multerUpload = multer({ storage, fileFilter });

// ------------------------------
// Middleware to upload to Cloudinary
// ------------------------------
const uploadMiddleware = async (req, res, next) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "No file uploaded." });

  try {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `bingo_other_receipts/${req.body.type || "other"}`, // ✅ dynamic folder: deposit/cashout
      },
      (error, result) => {
        if (error) return next(error);
        req.fileUrl = result.secure_url; // ✅ new: add uploaded URL to request
        next();
      }
    );

    // Push buffer to Cloudinary upload stream
    const readable = Readable.from(file.buffer);
    readable.pipe(stream);
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ message: "Upload failed." });
  }
};

// Export both multer middleware for parsing and Cloudinary upload
module.exports = multerUpload; // ✅ keep for parsing file in routes
module.exports.single = (fieldName) => [multerUpload.single(fieldName), uploadMiddleware]; // ✅ new combined middleware