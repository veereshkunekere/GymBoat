import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },

    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },

    // Plan snapshot
    planName: {
      type: String,
      required: true,
    },

    durationDays: {
      type: Number,
      required: true,
    },

    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Payment summary (transactions handled separately)
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dueAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
      default: "UNPAID",
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "UPCOMING",
        "ACTIVE",
        "EXPIRED",
        "PAUSED",
        "CANCELLED",
      ],
      default: "UPCOMING",
    },

    // Pause management
    pausedAt: {
      type: Date,
      default: null,
    },

    resumedAt: {
      type: Date,
      default: null,
    },

    totalPausedDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    pauseHistory: [
      {
        pausedAt: { type: Date, required: true },
        resumedAt: { type: Date, default: null },
        days: { type: Number, default: 0 },
      },
    ],

    // Renewal history
    previousMembershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Membership",
      default: null,
    },
  },
  { timestamps: true }
);

membershipSchema.index({
  gymId: 1,
  memberId: 1,
  startDate: 1,
  endDate: 1,
});

membershipSchema.index({
  gymId: 1,
  status: 1,
  endDate: 1,
});

const Membership = mongoose.model("Membership", membershipSchema);

export default Membership;