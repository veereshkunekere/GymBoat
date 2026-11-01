import multer from "multer";
import path from "path";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (ext === ".xls") {
      return cb(
        Object.assign(
          new Error("Old .xls files are not supported. Open it in Excel and save as .xlsx"),
          { statusCode: 400 }
        )
      );
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(
        Object.assign(new Error("Only .xlsx and .csv files are supported"), { statusCode: 400 })
      );
    }

    cb(null, true);
  },
});

// Wraps multer so its errors become clean 400 responses via the error middleware.
export const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      err.statusCode = 400;
      err.message = "File is larger than 5 MB";
    } else if (err.name === "MulterError") {
      err.statusCode = 400;
    }

    next(err);
  });
};
