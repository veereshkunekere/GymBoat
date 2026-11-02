import mongoose from "mongoose";

const schema = new mongoose.Schema({
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true, index: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
  phone: { type: String, required: true },
  type: { type: String, enum: ["MANUAL", "EXPIRY_REMINDER", "TEST"], required: true },
  templateName: { type: String, required: true },
  status: { type: String, enum: ["QUEUED", "SENT", "FAILED"], default: "QUEUED" },
  providerMessageId: { type: String, default: null },
  errorMessage: { type: String, default: null },
  idempotencyKey: { type: String, unique: true, sparse: true },
  sentAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ gymId: 1, createdAt: -1 });
export default mongoose.model("WhatsAppNotification", schema);
