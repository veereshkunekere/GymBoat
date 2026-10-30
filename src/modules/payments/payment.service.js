
import mongoose from "mongoose";
import { randomUUID } from "crypto";

import Payment from "../../models/Payment.js";
import Membership from "../../models/Membership.js";
import Member from "../../models/Member.js";
import Gym from "../../models/Gym.js";

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// --------------------------------------------------
// TRANSACTION HELPER
// --------------------------------------------------

const runTransaction = async (callback) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        result = await callback(session);
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" }
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const getGym = async (ownerId, session) => {
  const gym = await Gym.findOne({
    ownerId,
    isActive: true
  }).session(session);

  if (!gym) {
    throw createError("Active gym not found", 404);
  }

  return gym;
};

const validateObjectId = (id, field) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(`Invalid ${field}`);
  }
};

const generateReceiptNumber = () => {
  return `RCPT-${Date.now()}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
};

const normalizeAmount = (amount) => {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw createError("Payment amount must be greater than zero");
  }

  if (Math.round(value * 100) !== value * 100) {
    throw createError("Payment amount cannot have more than 2 decimal places");
  }

  return value;
};

const normalizePaymentDate = (date) => {
  if (date === undefined) return new Date();

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    throw createError("Invalid payment date");
  }

  if (parsed > new Date()) {
    throw createError("Payment date cannot be in the future");
  }

  return parsed;
};

// --------------------------------------------------
// RECORD PAYMENT
// --------------------------------------------------

export const recordPayment = async (ownerId, data) => {
  validateObjectId(data.memberId, "memberId");
  validateObjectId(data.membershipId, "membershipId");

  const amount = normalizeAmount(data.amount);

  const allowedMethods = [
    "CASH",
    "UPI",
    "BANK_TRANSFER"
  ];

  if (!allowedMethods.includes(data.method)) {
    throw createError("Invalid payment method");
  }

  return runTransaction(async (session) => {

    const gym = await getGym(ownerId, session);

    // Lock member to prevent concurrent membership/payment changes
    const member = await Member.findOneAndUpdate(
      {
        _id: data.memberId,
        gymId: gym._id,
        isArchived: false
      },
      {
        $inc: {
          membershipLockVersion: 1
        }
      },
      {
        returnDocument: "after",
        session,
        runValidators: true
      }
    );

    if (!member) {
      throw createError("Member not found or archived", 404);
    }

    // Find membership belonging to this gym and member
    const membership = await Membership.findOne({
      _id: data.membershipId,
      gymId: gym._id,
      memberId: member._id
    }).session(session);

    if (!membership) {
      throw createError(
        "Membership not found for this member",
        404
      );
    }

    if (membership.status === "CANCELLED") {
      throw createError(
        "Cannot record payment for a cancelled membership"
      );
    }

    // Recalculate remaining balance from the membership summary.
    // Calculate total amount already reserved by pending payments.
const pendingPayments = await Payment.aggregate([
  {
    $match: {
      gymId: gym._id,
      membershipId: membership._id,
      status: "PENDING"
    }
  },
  {
    $group: {
      _id: null,
      totalPending: {
        $sum: "$amount"
      }
    }
  }
]).session(session);

const pendingAmount = pendingPayments[0]?.totalPending || 0;

// Calculate the amount available for a new payment.
const dueAmount = Math.max(
  0,
  Math.round(
    (membership.finalPrice - membership.paidAmount) * 100
  ) / 100
);

const availableBalance = Math.max(
  0,
  Math.round(
    (dueAmount - pendingAmount) * 100
  ) / 100
);

if (availableBalance <= 0) {
  throw createError(
    "Outstanding balance is already reserved by pending payments"
  );
}

if (amount > availableBalance) {
  throw createError(
    `Payment exceeds available balance. Available amount: ${availableBalance}`
  );
}

    const paymentDate = normalizePaymentDate(data.paymentDate);

    const payment = new Payment({
      gymId: gym._id,
      memberId: member._id,
      membershipId: membership._id,

      amount,
      method: data.method,

      // Every new payment requires manual verification.
      status: "PENDING",

      transactionReference:
        data.transactionReference?.trim() || null,

      paymentDate,

      receiptNumber: generateReceiptNumber(),

      collectedBy: ownerId,

      notes: data.notes?.trim() || ""
    });

    await payment.save({ session });

    // Do not update membership financial summary yet.
    // Only verified payments contribute to paidAmount.

    return {
      payment,
      membershipBalance: {
  finalPrice: membership.finalPrice,
  paidAmount: membership.paidAmount,
  pendingAmount,
  dueAmount,
  availableBalance,
  paymentStatus: membership.paymentStatus
}
    };
  });
};

export const getOutstandingBalances = async (ownerId, query = {}) => {
  const gym = await getGym(ownerId);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = {
    gymId: gym._id,
    dueAmount: { $gt: 0 },
  };

  const [memberships, total, summary] = await Promise.all([
    Membership.find(filter)
      .populate("memberId", "name phone")
      .sort({ dueAmount: -1, endDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Membership.countDocuments(filter),

    Membership.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: "$dueAmount" },
          membershipCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    summary: {
      totalOutstanding: summary[0]?.totalOutstanding || 0,
      membershipCount: summary[0]?.membershipCount || 0,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    memberships,
  };
};

export const getPendingPayments = async (ownerId, query = {}) => {
  const gym = await getGym(ownerId);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = {
    gymId: gym._id,
    status: "PENDING",
  };

  const [payments, total, summary] = await Promise.all([
    Payment.find(filter)
      .populate("memberId", "name phone")
      .populate("membershipId", "planName finalPrice dueAmount")
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Payment.countDocuments(filter),

    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          pendingAmount: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    summary: {
      pendingAmount: summary[0]?.pendingAmount || 0,
      paymentCount: summary[0]?.paymentCount || 0,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    payments,
  };
};

export const getPaymentHistory = async (ownerId, query = {}) => {
  const gym = await getGym(ownerId);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = {
    gymId: gym._id,
  };

  if (query.memberId) {
    if (!mongoose.Types.ObjectId.isValid(query.memberId)) {
      throw createError("Invalid member ID", 400);
    }

    filter.memberId = query.memberId;
  }

  if (query.status) {
    const allowedStatuses = ["PENDING", "PAID", "REJECTED"];

    if (!allowedStatuses.includes(query.status)) {
      throw createError("Invalid payment status", 400);
    }

    filter.status = query.status;
  }

  if (query.method) {
    const allowedMethods = ["CASH", "UPI", "BANK_TRANSFER"];

    if (!allowedMethods.includes(query.method)) {
      throw createError("Invalid payment method", 400);
    }

    filter.method = query.method;
  }

  if (query.from || query.to) {
    filter.paymentDate = {};

    if (query.from) {
      const from = new Date(query.from);

      if (Number.isNaN(from.getTime())) {
        throw createError(400, "Invalid from date");
      }

      from.setHours(0, 0, 0, 0);
      filter.paymentDate.$gte = from;
    }

    if (query.to) {
      const to = new Date(query.to);

      if (Number.isNaN(to.getTime())) {
        throw createError(400, "Invalid to date");
      }

      to.setHours(23, 59, 59, 999);
      filter.paymentDate.$lte = to;
    }

    if (
      filter.paymentDate.$gte &&
      filter.paymentDate.$lte &&
      filter.paymentDate.$gte > filter.paymentDate.$lte
    ) {
      throw createError(400, "From date cannot be after to date");
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate("memberId", "name phone")
      .populate("membershipId", "planName finalPrice")
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Payment.countDocuments(filter),
  ]);

  return {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    payments,
  };
};

export const getPaymentById = async (ownerId, paymentId) => {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw createError("Invalid payment ID", 400);
  }

  const gym = await getGym(ownerId);

  const payment = await Payment.findOne({
    _id: paymentId,
    gymId: gym._id,
  })
    .populate("memberId", "name phone email")
    .populate("membershipId", "planName originalPrice discount finalPrice")
    .populate("collectedBy", "name email")
    .populate("verifiedBy", "name email")
    .populate("rejectedBy", "name email")
    .lean();

  if (!payment) {
    throw createError("Payment not found", 404);
  }

  return payment;
};


export const verifyPayment = async (ownerId, paymentId) => {
  validateObjectId(paymentId, "paymentId");

  return runTransaction(async (session) => {
    const gym = await getGym(ownerId, session);

    // Find payment within the owner's gym.
    let payment = await Payment.findOne({
      _id: paymentId,
      gymId: gym._id,
    }).session(session);

    if (!payment) {
      throw createError("Payment not found", 404);
    }

    // Lock the member to serialize financial updates.
    const member = await Member.findOneAndUpdate(
      {
        _id: payment.memberId,
        gymId: gym._id,
        isArchived: false,
      },
      {
        $inc: { membershipLockVersion: 1 },
      },
      {
        returnDocument: "after",
        session,
        runValidators: true,
      }
    );

    if (!member) {
      throw createError("Member not found or archived", 404);
    }

    // Re-read after acquiring the lock.
    payment = await Payment.findOne({
      _id: paymentId,
      gymId: gym._id,
    }).session(session);

    if (!payment || payment.status !== "PENDING") {
      throw createError(
        "Payment is not pending or has already been processed",
        409
      );
    }

    const membership = await Membership.findOne({
      _id: payment.membershipId,
      gymId: gym._id,
      memberId: member._id,
    }).session(session);

    if (!membership) {
      throw createError("Membership not found", 404);
    }

    const newPaidAmount = Math.round(
      (membership.paidAmount + payment.amount) * 100
    ) / 100;

    if (newPaidAmount > membership.finalPrice) {
      throw createError(
        "Payment exceeds the remaining membership balance",
        409
      );
    }

    const newDueAmount = Math.max(
      0,
      Math.round(
        (membership.finalPrice - newPaidAmount) * 100
      ) / 100
    );

    membership.paidAmount = newPaidAmount;
    membership.dueAmount = newDueAmount;

    membership.paymentStatus =
      newDueAmount === 0
        ? "PAID"
        : "PARTIALLY_PAID";

    payment.status = "PAID";
    payment.verifiedAt = new Date();
    payment.verifiedBy = ownerId;

    await membership.save({ session });
    await payment.save({ session });

    return {
      payment,
      membershipBalance: {
        finalPrice: membership.finalPrice,
        paidAmount: membership.paidAmount,
        dueAmount: membership.dueAmount,
        paymentStatus: membership.paymentStatus,
      },
    };
  });
};


export const rejectPayment = async (
  ownerId,
  paymentId,
  rejectionReason = ""
) => {
  validateObjectId(paymentId, "paymentId");

  if (typeof rejectionReason !== "string") {
    throw createError("Invalid rejection reason");
  }

  if (rejectionReason.length > 300) {
    throw createError("Rejection reason cannot exceed 300 characters");
  }

  return runTransaction(async (session) => {
    const gym = await getGym(ownerId, session);

    let payment = await Payment.findOne({
      _id: paymentId,
      gymId: gym._id,
    }).session(session);

    if (!payment) {
      throw createError("Payment not found", 404);
    }

    const member = await Member.findOneAndUpdate(
      {
        _id: payment.memberId,
        gymId: gym._id,
        isArchived: false,
      },
      {
        $inc: { membershipLockVersion: 1 },
      },
      {
        returnDocument: "after",
        session,
        runValidators: true,
      }
    );

    if (!member) {
      throw createError("Member not found or archived", 404);
    }

    payment = await Payment.findOne({
      _id: paymentId,
      gymId: gym._id,
    }).session(session);

    if (!payment || payment.status !== "PENDING") {
      throw createError(
        "Payment is not pending or has already been processed",
        409
      );
    }

    payment.status = "REJECTED";
    payment.rejectedAt = new Date();
    payment.rejectedBy = ownerId;
    payment.rejectionReason = rejectionReason.trim() || null;

    await payment.save({ session });

    return payment;
  });
};
