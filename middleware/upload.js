// middleware/upload.js
const multer = require("multer");
const cloudinary = require("../cloudinary"); // Cloudinary config
const { Readable } = require("stream");

// ------------------------------
// Multer memory storage instead of disk storage
// ------------------------------
const storage = multer.memoryStorage();

// File filter for images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const ext = file.originalname.split(".").pop().toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only jpeg, jpg, png, and pdf files are allowed"), false);
  }
};

// Multer instance for parsing multipart/form-data
const multerUpload = multer({ storage, fileFilter });

// ------------------------------
// Middleware to upload to Cloudinary
// ------------------------------
const uploadToCloudinary = (folderPrefix = "other") => {
  return async (req, res, next) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded." });

    try {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `bingo_${folderPrefix}_receipts`, // dynamic folder
        },
        (error, result) => {
          if (error) return next(error);
          req.fileUrl = result.secure_url; // store Cloudinary URL in request
          next();
        }
      );

      // Pipe the buffer into the Cloudinary stream
      const readable = Readable.from(file.buffer);
      readable.pipe(stream);
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      res.status(500).json({ message: "Upload failed." });
    }
  };
};

// ------------------------------
// Export: combine multer parsing and Cloudinary upload safely
// ------------------------------
module.exports = {
  single: (fieldName, folderType) => [
    multerUpload.single(fieldName),       // parse the file
    uploadToCloudinary(folderType || "other"), // upload to Cloudinary
  ],
};