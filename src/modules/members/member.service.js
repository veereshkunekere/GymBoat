
import mongoose from "mongoose";
import Member from "../../models/Member.js";
import Gym from "../../models/Gym.js";

const getOwnerGym = async (ownerId) => {
  const gym = await Gym.findOne({
    ownerId,
    isActive: true
  });

  if (!gym) {
    const error = new Error("Gym not found or inactive");
    error.statusCode = 404;
    throw error;
  }

  return gym;
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ADD MEMBER
export const addMember = async (ownerId, data) => {
  const gym = await getOwnerGym(ownerId);

  const member = await Member.create({
    gymId: gym._id,
    name: data.name.trim(),
    phone: data.phone.replace(/\D/g, ""),
    email: data.email || null,
    gender: data.gender || "OTHER",
    address: data.address || "",
    dateOfBirth: data.dateOfBirth || undefined,
    joinedAt: data.joinedAt || new Date()
  });

  return member;
};

// LIST / SEARCH / FILTER MEMBERS
export const getMembers = async (ownerId, query) => {
  const gym = await getOwnerGym(ownerId);

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 10)
  );

  const filter = { gymId: gym._id };

  // Archived members are excluded by default
  if (query.archived === "true") {
    filter.isArchived = true;
  } else {
    filter.isArchived = false;
  }

  if (query.search?.trim()) {
    const search = escapeRegex(query.search.trim());

    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ];
  }

  if (query.gender) {
    filter.gender = query.gender.toUpperCase();
  }

  if (query.joinedFrom || query.joinedTo) {
    filter.joinedAt = {};

    if (query.joinedFrom) {
      const from = new Date(query.joinedFrom);
      if (Number.isNaN(from.getTime())) {
        throw Object.assign(new Error("Invalid joinedFrom date"), {
          statusCode: 400
        });
      }
      filter.joinedAt.$gte = from;
    }

    if (query.joinedTo) {
      const to = new Date(query.joinedTo);
      if (Number.isNaN(to.getTime())) {
        throw Object.assign(new Error("Invalid joinedTo date"), {
          statusCode: 400
        });
      }
      to.setHours(23, 59, 59, 999);
      filter.joinedAt.$lte = to;
    }
  }

  const allowedSortFields = ["name", "createdAt", "joinedAt"];
  const sortBy = allowedSortFields.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";

  const order = query.order === "asc" ? 1 : -1;

  const [members, total] = await Promise.all([
    Member.find(filter)
      .sort({ [sortBy]: order })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Member.countDocuments(filter)
  ]);

  return {
    members,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// GET SINGLE MEMBER
export const getMemberById = async (ownerId, memberId) => {
  if (!mongoose.isValidObjectId(memberId)) {
    throw Object.assign(new Error("Invalid member ID"), {
      statusCode: 400
    });
  }

  const gym = await getOwnerGym(ownerId);

  const member = await Member.findOne({
    _id: memberId,
    gymId: gym._id,
    isArchived: false
  });

  if (!member) {
    throw Object.assign(new Error("Member not found"), {
      statusCode: 404
    });
  }

  return member;
};

// UPDATE MEMBER
export const updateMember = async (ownerId, memberId, data) => {
  if (!mongoose.isValidObjectId(memberId)) {
    throw Object.assign(new Error("Invalid member ID"), {
      statusCode: 400
    });
  }

  const gym = await getOwnerGym(ownerId);

  const allowedFields = [
    "name",
    "phone",
    "email",
    "gender",
    "address",
    "dateOfBirth",
    "joinedAt"
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  if (updates.name !== undefined) {
    updates.name = updates.name.trim();
  }

  if (updates.phone !== undefined) {
    updates.phone = updates.phone.replace(/\D/g, "");
  }

  if (updates.email !== undefined) {
    updates.email = updates.email?.toLowerCase() || null;
  }

  const member = await Member.findOneAndUpdate(
    {
      _id: memberId,
      gymId: gym._id,
      isArchived: false
    },
    { $set: updates },
    {
      returnDocument: "after",
      runValidators: true
    }
  );

  if (!member) {
    throw Object.assign(new Error("Member not found"), {
      statusCode: 404
    });
  }

  return member;
};

// ARCHIVE MEMBER
export const archiveMember = async (ownerId, memberId) => {
  if (!mongoose.isValidObjectId(memberId)) {
    throw Object.assign(new Error("Invalid member ID"), {
      statusCode: 400
    });
  }

  const gym = await getOwnerGym(ownerId);

  const member = await Member.findOneAndUpdate(
    {
      _id: memberId,
      gymId: gym._id,
      isArchived: false
    },
    { $set: { isArchived: true } },
    { returnDocument: "after" }
  );

  if (!member) {
    throw Object.assign(new Error("Member not found"), {
      statusCode: 404
    });
  }

  return member;
};

// RESTORE MEMBER
export const restoreMember = async (ownerId, memberId) => {
  if (!mongoose.isValidObjectId(memberId)) {
    throw Object.assign(new Error("Invalid member ID"), {
      statusCode: 400
    });
  }

  const gym = await getOwnerGym(ownerId);

  const member = await Member.findOneAndUpdate(
    {
      _id: memberId,
      gymId: gym._id,
      isArchived: true
    },
    { $set: { isArchived: false } },
    { returnDocument: "after" }
  );

  if (!member) {
    throw Object.assign(new Error("Archived member not found"), {
      statusCode: 404
    });
  }

  return member;
};
