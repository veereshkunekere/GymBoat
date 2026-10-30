
import mongoose from "mongoose";

const memberSchema = new mongoose.Schema({
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Gym",
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  phone: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null
  },

  gender: {
    type: String,
    enum: ["MALE", "FEMALE", "OTHER"],
    default: "OTHER"
  },

  address: {
    type: String,
    trim: true,
    maxlength: 300
  },

  dateOfBirth: Date,

  joinedAt: {
    type: Date,
    default: Date.now
  },

  isArchived: {
    type: Boolean,
    default: false
  },
  membershipLockVersion: {
  type: Number,
  default: 0,
  select: false,
},

}, { timestamps: true });

// One phone number per gym
memberSchema.index(
  { gymId: 1, phone: 1 },
  { unique: true }
);

// Efficient gym member listing
memberSchema.index({ gymId: 1, createdAt: -1 });
memberSchema.index({ gymId: 1, isArchived: 1 });

const Member = mongoose.model("Member", memberSchema);

export default Member;
