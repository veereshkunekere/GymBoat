
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
      index: true
    },

    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true
    },

    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01
    },

    method: {
      type: String,
      enum: ["CASH", "UPI", "BANK_TRANSFER"],
      required: true
    },

    status: {
      type: String,
      enum: ["PENDING", "PAID", "REJECTED"],
      default: "PENDING"
    },

    transactionReference: {
      type: String,
      trim: true,
      default: null
    },

    paymentDate: {
      type: Date,
      default: Date.now
    },

    receiptNumber: {
      type: String,
      trim: true,
      default: null
    },

    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      default: null
    },

    verifiedAt: {
      type: Date,
      default: null
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      default: null
    },

    rejectedAt: {
      type: Date,
      default: null
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      default: null
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null
    },

    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

// Payment history
paymentSchema.index({
  gymId: 1,
  memberId: 1,
  paymentDate: -1
});

// Membership transaction lookup
paymentSchema.index({
  gymId: 1,
  membershipId: 1,
  status: 1
});

// Gym-wide payment listing
paymentSchema.index({
  gymId: 1,
  createdAt: -1
});

// Prevent duplicate receipt numbers within a gym
paymentSchema.index(
  { gymId: 1, receiptNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      receiptNumber: { $type: "string" }
    }
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
