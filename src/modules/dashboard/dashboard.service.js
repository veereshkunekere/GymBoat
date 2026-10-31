
import Member from "../../models/Member.js";
import Membership from "../../models/Membership.js";
import Payment from "../../models/Payment.js";
import Gym from "../../models/Gym.js";

const getIndiaToday = () => {
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

const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const getDashboardData = async (ownerId) => {
  const gym = await Gym.findOne({
    ownerId,
    isActive: true,
  });

  if (!gym) {
    const error = new Error("Active gym not found");
    error.statusCode = 404;
    throw error;
  }

  const gymId = gym._id;

  const today = getIndiaToday();
  const tomorrow = addDays(today, 1);
  const sevenDaysLater = addDays(today, 7);

  const monthStart = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      1
    )
  );

  const [
    totalMembers,
    activeMembers,
    expiredMembers,
    expiringSoon,
    todayCollections,
    monthlyCollections,
    pendingPayments,
    outstanding,
    recentMembers,
    recentMemberships,
    recentPayments,
  ] = await Promise.all([

    // Total registered members
    Member.countDocuments({
      gymId,
      isArchived: false,
    }),

    // Distinct members with active memberships
    Membership.distinct("memberId", {
      gymId,
      status: "ACTIVE",
      startDate: { $lte: today },
      endDate: { $gte: today },
    }),

    // Distinct members with expired memberships
    Membership.distinct("memberId", {
      gymId,
      status: "EXPIRED",
      endDate: { $lt: today },
    }),

    // Memberships expiring within seven days
    Membership.countDocuments({
      gymId,
      status: "ACTIVE",
      endDate: {
        $gte: today,
        $lte: sevenDaysLater,
      },
    }),

    // Today's verified collections
    Payment.aggregate([
      {
        $match: {
          gymId,
          status: "PAID",
          paymentDate: {
            $gte: today,
            $lt: tomorrow,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]),

    // Current month's verified collections
    Payment.aggregate([
      {
        $match: {
          gymId,
          status: "PAID",
          paymentDate: {
            $gte: monthStart,
            $lt: tomorrow,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]),

    // Pending payments
    Payment.aggregate([
      {
        $match: {
          gymId,
          status: "PENDING",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),

    // Outstanding membership dues
    Membership.aggregate([
      {
        $match: {
          gymId,
          dueAmount: { $gt: 0 },
          status: { $ne: "CANCELLED" },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$dueAmount" },
        },
      },
    ]),

    // Recent member registrations
    Member.find({ gymId })
      .select("name createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    // Recent membership changes
    Membership.find({ gymId })
      .populate("memberId", "name")
      .select("memberId planName status createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),

    // Recent payments
    Payment.find({ gymId })
      .populate("memberId", "name")
      .select("memberId amount status method createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // Combine recent activities
  const recentActivities = [
    ...recentMembers.map((member) => ({
      type: "MEMBER_REGISTERED",
      description: `${member.name} registered`,
      date: member.createdAt,
    })),

    ...recentMemberships.map((membership) => ({
      type: "MEMBERSHIP_UPDATED",
      description:
        `${membership.memberId?.name || "Member"} - ` +
        `${membership.planName} (${membership.status})`,
      date: membership.updatedAt || membership.createdAt,
    })),

    ...recentPayments.map((payment) => ({
      type: `PAYMENT_${payment.status}`,
      description:
        `${payment.memberId?.name || "Member"} - ` +
        `₹${payment.amount} (${payment.status})`,
      date: payment.updatedAt || payment.createdAt,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    )
    .slice(0, 10);

  return {
    members: {
      total: totalMembers,
      active: activeMembers.length,
      expired: expiredMembers.length,
      expiringSoon,
    },

    collections: {
      today:
        todayCollections[0]?.total || 0,

      thisMonth:
        monthlyCollections[0]?.total || 0,

      pending:
        pendingPayments[0]?.total || 0,

      outstanding:
        outstanding[0]?.total || 0,
    },

    recentActivities,

    generatedAt: new Date(),
  };
};

export { getDashboardData };
