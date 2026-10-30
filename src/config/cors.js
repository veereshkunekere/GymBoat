import cors from "cors";
import { env } from "./env.js";

const allowedOrigins = env.CLIENT_URL
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {

    // Allow requests without an Origin header
    // (Postman, server-to-server requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error("Not allowed by CORS")
    );
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],

  credentials: true,

  optionsSuccessStatus: 204
};

const corsMiddleware = cors(corsOptions);

export default corsMiddleware;