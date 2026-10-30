import Plan from "../../models/Plan.js";
import Gym from "../../models/Gym.js";

const getGym = async (ownerId) => {
  const gym = await Gym.findOne({
    ownerId,
    isActive: true,
  });

  if (!gym) {
    const error = new Error("Active gym not found");
    error.statusCode = 404;
    throw error;
  }

  return gym;
};

// CREATE PLAN
export const createPlan = async (ownerId, data) => {
  const gym = await getGym(ownerId);

  const plan = await Plan.create({
    gymId: gym._id,
    name: data.name.trim(),
    durationDays: data.durationDays,
    price: data.price,
    description: data.description || "",
  });

  return plan;
};

// GET ALL PLANS
export const getPlans = async (ownerId, filters = {}) => {
  const gym = await getGym(ownerId);

  const query = { gymId: gym._id };

  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive === "true";
  }

  return Plan.find(query).sort({ createdAt: -1 });
};

// GET SINGLE PLAN
export const getPlanById = async (ownerId, planId) => {
  const gym = await getGym(ownerId);

  const plan = await Plan.findOne({
    _id: planId,
    gymId: gym._id,
  });

  if (!plan) {
    const error = new Error("Plan not found");
    error.statusCode = 404;
    throw error;
  }

  return plan;
};

// UPDATE PLAN
export const updatePlan = async (ownerId, planId, data) => {
  const gym = await getGym(ownerId);

  const plan = await Plan.findOne({
    _id: planId,
    gymId: gym._id,
  });

  if (!plan) {
    const error = new Error("Plan not found");
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = [
    "name",
    "durationDays",
    "price",
    "description",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      plan[field] =
        field === "name" ? data[field].trim() : data[field];
    }
  }

  await plan.save();

  return plan;
};

// ACTIVATE / DEACTIVATE PLAN
export const updatePlanStatus = async (
  ownerId,
  planId,
  isActive
) => {
  const gym = await getGym(ownerId);

  const plan = await Plan.findOneAndUpdate(
    { _id: planId, gymId: gym._id },
    { $set: { isActive } },
    { returnDocument: "after", runValidators: true }
  );

  if (!plan) {
    const error = new Error("Plan not found");
    error.statusCode = 404;
    throw error;
  }

  return plan;
};