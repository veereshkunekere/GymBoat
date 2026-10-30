
import mongoose from "mongoose";

const gymSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },

    phone: {
      type: String,
      trim: true
    },

    email: {
      type: String,
      lowercase: true,
      trim: true
    },

    address: {
      type: String,
      trim: true
    },

    upiId: String,

    isActive: {
      type: Boolean,
      default: true
    },

    currency: {
      type: String,
      default: "INR"
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata"
    }
  },
  { timestamps: true }
);

gymSchema.index({ ownerId: 1 }, { unique: true });

export default mongoose.model("Gym", gymSchema);
