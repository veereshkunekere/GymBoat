
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Owner from "../../models/Owner.js";
import Gym from "../../models/Gym.js";
import { generateToken } from "../../utils/generateToken.js";

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// OWNER REGISTRATION
export const registerOwner = async (data) => {
  const email = data.email.toLowerCase().trim();

  const existingOwner = await Owner.findOne({ email });

  if (existingOwner) {
    throw createError("Email already registered", 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const session = await mongoose.startSession();

  let owner;

  try {
    await session.withTransaction(async () => {
      [owner] = await Owner.create(
        [{
          name: data.name,
          email,
          passwordHash
        }],
        { session }
      );

      await Gym.create(
        [{
          ownerId: owner._id,
          name: data.gymName,
          phone: data.phone
        }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const token = generateToken(owner._id);

  return {
    owner: {
      id: owner._id,
      name: owner.name,
      email: owner.email
    },
    token
  };
};

// OWNER LOGIN
export const loginOwner = async (data) => {
  const email = data.email.toLowerCase().trim();

  const owner = await Owner.findOne({ email })
    .select("+passwordHash");

  if (!owner) {
    throw createError("Invalid email or password", 401);
  }

  const isPasswordValid = await bcrypt.compare(
    data.password,
    owner.passwordHash
  );

  if (!isPasswordValid) {
    throw createError("Invalid email or password", 401);
  }

  if (!owner.isActive) {
    throw createError("Account is deactivated", 403);
  }

  const token = generateToken(owner._id);

  return {
    owner: {
      id: owner._id,
      name: owner.name,
      email: owner.email
    },
    token
  };
};

// CURRENT OWNER
export const getCurrentOwner = (owner) => ({
  id: owner._id,
  name: owner.name,
  email: owner.email
});
