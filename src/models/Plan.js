import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

planSchema.index({ gymId: 1, name: 1 });
planSchema.index({ gymId: 1, isActive: 1 });

const Plan = mongoose.model("Plan", planSchema);

export default Plan;