import mongoose from "mongoose";

import Membership from "../../models/Membership.js";
import Member from "../../models/Member.js";
import Plan from "../../models/Plan.js";
import Gym from "../../models/Gym.js";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// --------------------------------------------------
// TRANSACTION HELPERS
// --------------------------------------------------

const runTransaction = async (callback) => {
  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(
      async () => {
        result = await callback(session);
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

// Serialize membership changes for the same member
const lockMember = async (gymId, memberId, session) => {
  const member = await Member.findOneAndUpdate(
    {
      _id: memberId,
      gymId,
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

  return member;
};

const getGym = async (ownerId, session = null) => {
  let query = Gym.findOne({
    ownerId,
    isActive: true,
  });

  if (session) query = query.session(session);

  const gym = await query;

  if (!gym) {
    throw createError("Active gym not found", 404);
  }

  return gym;
};

const getPlan = async (
  gymId,
  planId,
  session = null
) => {
  let query = Plan.findOne({
    _id: planId,
    gymId,
    isActive: true,
  });

  if (session) query = query.session(session);

  const plan = await query;

  if (!plan) {
    throw createError("Active plan not found", 404);
  }

  return plan;
};

const getTodayInTimezone = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day)
    )
  );
};

const normalizeDate = (date) => {
  if (date === undefined) {
    return getTodayInTimezone();
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    throw createError("Invalid date");
  }

  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate()
    )
  );
};

// Add calendar days
const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

// Difference between two calendar dates
const daysBetween = (start, end) => {
  return Math.round(
    (normalizeDate(end) - normalizeDate(start)) /
      (1000 * 60 * 60 * 24)
  );
};

const getPaymentStatus = (paidAmount, finalPrice) => {
  if (paidAmount <= 0) return "UNPAID";

  if (paidAmount >= finalPrice) return "PAID";

  return "PARTIALLY_PAID";
};

const getCurrentStatus = (startDate, endDate) => {
  const today = normalizeDate();

  if (today < normalizeDate(startDate)) {
    return "UPCOMING";
  }

  if (today > normalizeDate(endDate)) {
    return "EXPIRED";
  }

  return "ACTIVE";
};

// Verify member belongs to gym
const getMember = async (gymId, memberId) => {
  const member = await Member.findOne({
    _id: memberId,
    gymId,
    isArchived: false,
  });

  if (!member) {
    throw createError("Member not found or archived", 404);
  }

  return member;
};

// Verify plan belongs to gym

// Calculate membership financial values
const calculateAmounts = (plan, discount = 0, paidAmount = 0) => {
  if (discount > plan.price) {
    throw createError("Discount cannot exceed plan price");
  }

  const finalPrice = plan.price - discount;

  if (paidAmount > finalPrice) {
    throw createError("Paid amount cannot exceed final price");
  }

  return {
    originalPrice: plan.price,
    discount,
    finalPrice,
    paidAmount,
    dueAmount: finalPrice - paidAmount,
    paymentStatus: getPaymentStatus(paidAmount, finalPrice),
  };
};

// Prevent overlapping memberships
const checkMembershipConflict = async (
  gymId,
  memberId,
  startDate,
  endDate,
  session,
  excludeMembershipId = null
) => {
  const query = {
    gymId,
    memberId,
    status: { $ne: "CANCELLED" },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeMembershipId) {
    query._id = { $ne: excludeMembershipId };
  }

  const existing = await Membership.findOne(query)
    .session(session);

  if (existing) {
    throw createError(
      "Member already has a membership during this period",
      409
    );
  }
};

// --------------------------------------------------
// ASSIGN MEMBERSHIP
// --------------------------------------------------

export const assignMembership = async (ownerId, data) => {
  return runTransaction(async (session) => {
    const gym = await getGym(ownerId, session);

    // Lock member before checking conflicts
    const member = await lockMember(
      gym._id,
      data.memberId,
      session
    );

    const plan = await getPlan(
      gym._id,
      data.planId,
      session
    );

    const startDate = normalizeDate(data.startDate);

    const endDate = addDays(
      startDate,
      plan.durationDays - 1
    );

    await checkMembershipConflict(
      gym._id,
      member._id,
      startDate,
      endDate,
      session
    );

    const amounts = calculateAmounts(
      plan,
      data.discount ?? 0,
      0
    );

    const [membership] = await Membership.create(
      [
        {
          gymId: gym._id,
          memberId: member._id,
          planId: plan._id,

          planName: plan.name,
          durationDays: plan.durationDays,

          ...amounts,

          startDate,
          endDate,

          status: getCurrentStatus(startDate, endDate),
        },
      ],
      { session }
    );

    return membership;
  });
};

// --------------------------------------------------
// GET ALL MEMBERSHIPS
// --------------------------------------------------

export const getMemberships = async (ownerId, filters = {}) => {
  const gym = await getGym(ownerId);

  const query = {
    gymId: gym._id,
  };

  if (filters.status) {
    const allowedStatuses = [
      "ACTIVE",
      "UPCOMING",
      "EXPIRED",
      "PAUSED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(filters.status)) {
      throw createError("Invalid membership status");
    }

    query.status = filters.status;
  }

  if (filters.memberId) {
    if (!mongoose.Types.ObjectId.isValid(filters.memberId)) {
      throw createError("Invalid memberId");
    }

    query.memberId = filters.memberId;
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(filters.limit) || 20)
  );

  const [memberships, total] = await Promise.all([
    Membership.find(query)
      .populate("memberId", "name phone email")
      .populate("planId", "name durationDays price")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),

    Membership.countDocuments(query),
  ]);

  return {
    memberships,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// --------------------------------------------------
// GET MEMBERSHIP BY ID
// --------------------------------------------------

export const getMembershipById = async (
  ownerId,
  membershipId
) => {
  const gym = await getGym(ownerId);

  const membership = await Membership.findOne({
    _id: membershipId,
    gymId: gym._id,
  })
    .populate("memberId", "name phone email")
    .populate("planId", "name durationDays price");

  if (!membership) {
    throw createError("Membership not found", 404);
  }

  return membership;
};

// --------------------------------------------------
// RENEW MEMBERSHIP
// --------------------------------------------------

export const renewMembership = async (
  ownerId,
  membershipId,
  data
) => {
  return runTransaction(async (session) => {
    const gym = await getGym(ownerId, session);

    let previous = await Membership.findOne({
      _id: membershipId,
      gymId: gym._id,
    }).session(session);

    if (!previous) {
      throw createError("Membership not found", 404);
    }

    const member = await lockMember(
      gym._id,
      previous.memberId,
      session
    );

    // Re-read after acquiring the member write lock
    previous = await Membership.findOne({
      _id: membershipId,
      gymId: gym._id,
    }).session(session);

    if (!previous) {
      throw createError("Membership not found", 404);
    }

    if (!["ACTIVE", "EXPIRED"].includes(previous.status)) {
      throw createError(
        "Only active or expired memberships can be renewed"
      );
    }

    const plan = await getPlan(
      gym._id,
      data.planId || previous.planId,
      session
    );

    const today = normalizeDate();

    const startDate =
      normalizeDate(previous.endDate) >= today
        ? addDays(normalizeDate(previous.endDate), 1)
        : today;

    const endDate = addDays(
      startDate,
      plan.durationDays - 1
    );

    await checkMembershipConflict(
      gym._id,
      member._id,
      startDate,
      endDate,
      session
    );

    const amounts = calculateAmounts(
      plan,
      data.discount ?? 0,
      0
    );

    const [membership] = await Membership.create(
      [
        {
          gymId: gym._id,
          memberId: member._id,
          planId: plan._id,

          planName: plan.name,
          durationDays: plan.durationDays,

          ...amounts,

          startDate,
          endDate,

          status: getCurrentStatus(startDate, endDate),

          previousMembershipId: previous._id,
        },
      ],
      { session }
    );

    return membership;
  });
};

// --------------------------------------------------
// PAUSE MEMBERSHIP
// --------------------------------------------------

export const pauseMembership = async (
  ownerId,
  membershipId
) => {
  const gym = await getGym(ownerId);
  const today = normalizeDate();

  const membership = await Membership.findOneAndUpdate(
    {
      _id: membershipId,
      gymId: gym._id,
      status: "ACTIVE",
      endDate: { $gte: today },
    },
    {
      $set: {
        status: "PAUSED",
        pausedAt: today,
        resumedAt: null,
      },
      $push: {
        pauseHistory: {
          pausedAt: today,
          resumedAt: null,
          days: 0,
        },
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );

  if (membership) return membership;

  const exists = await Membership.exists({
    _id: membershipId,
    gymId: gym._id,
  });

  if (!exists) {
    throw createError("Membership not found", 404);
  }

  throw createError(
    "Membership is not active or cannot be paused"
  );
};

// --------------------------------------------------
// RESUME MEMBERSHIP
// --------------------------------------------------

export const resumeMembership = async (
  ownerId,
  membershipId
) => {
  const gym = await getGym(ownerId);

  const current = await Membership.findOne({
    _id: membershipId,
    gymId: gym._id,
    status: "PAUSED",
  });

  if (!current || !current.pausedAt) {
    throw createError(
      "Membership is not paused"
    );
  }

  const today = normalizeDate();

  const pausedDays = daysBetween(
    current.pausedAt,
    today
  );

  const newEndDate = addDays(
    normalizeDate(current.endDate),
    pausedDays
  );

  const membership = await Membership.findOneAndUpdate(
    {
      _id: membershipId,
      gymId: gym._id,
      status: "PAUSED",
      pausedAt: current.pausedAt,
      pauseHistory: {
        $elemMatch: {
          pausedAt: current.pausedAt,
          resumedAt: null,
        },
      },
    },
    {
      $set: {
        status: getCurrentStatus(
          current.startDate,
          newEndDate
        ),
        endDate: newEndDate,
        resumedAt: today,
        pausedAt: null,
        "pauseHistory.$.resumedAt": today,
        "pauseHistory.$.days": pausedDays,
      },
      $inc: {
        totalPausedDays: pausedDays,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );

  if (!membership) {
    throw createError(
      "Membership was already resumed or modified. Refresh and try again.",
      409
    );
  }

  return membership;
};

// --------------------------------------------------
// CANCEL MEMBERSHIP
// --------------------------------------------------

export const cancelMembership = async (
  ownerId,
  membershipId
) => {
  const gym = await getGym(ownerId);

  const membership = await Membership.findOneAndUpdate(
    {
      _id: membershipId,
      gymId: gym._id,
      status: {
        $nin: ["CANCELLED", "EXPIRED"],
      },
    },
    {
      $set: {
        status: "CANCELLED",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );

  if (membership) return membership;

  const exists = await Membership.exists({
    _id: membershipId,
    gymId: gym._id,
  });

  if (!exists) {
    throw createError("Membership not found", 404);
  }

  throw createError(
    "Membership is already cancelled or expired"
  );
};