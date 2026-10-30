import mongoose from "mongoose";
import { env } from "./env.js";

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI);

    console.log(
      `MongoDB Connected: ${connection.connection.host}`
    );

  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    throw error;
  }
};

export default connectDB;