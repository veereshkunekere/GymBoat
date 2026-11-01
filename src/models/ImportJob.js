import mongoose from "mongoose";

const failureSchema = new mongoose.Schema(
  {
    rowNumber: Number,
    name: String,
    phone: String,
    reason: String,
  },
  { _id: false }
);

const importJobSchema = new mongoose.Schema(
  {
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "Owner", required: true },

    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    sheetName: { type: String, default: "" },

    // Header row as found in the file, and the file's data rows (all cells as strings).
    headers: [String],
    headerRowNumber: { type: Number, default: 1 }, // 1-based row number in the sheet
    totalRows: { type: Number, default: 0 },
    // Raw rows are personal data: only kept until the import is committed (or the job expires).
    rows: { type: [[String]], select: false, default: [] },
    rowNumbers: { type: [Number], select: false, default: [] }, // original sheet row numbers

    status: {
      type: String,
      enum: ["UPLOADED", "COMMITTING", "COMPLETED", "FAILED", "UNDONE"],
      default: "UPLOADED",
    },

    mapping: { type: mongoose.Schema.Types.Mixed, default: null },
    options: { type: mongoose.Schema.Types.Mixed, default: null },

    result: {
      membersCreated: { type: Number, default: 0 },
      membershipsCreated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      failures: { type: [failureSchema], default: [] }, // capped in the service
      failuresTruncated: { type: Boolean, default: false },
      message: { type: String, default: "" },
    },

    startedAt: Date,
    completedAt: Date,

    // TTL: abandoned uploads (never committed) are deleted after 24h. Cleared on commit.
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

importJobSchema.index({ gymId: 1, createdAt: -1 });

export default mongoose.model("ImportJob", importJobSchema);
