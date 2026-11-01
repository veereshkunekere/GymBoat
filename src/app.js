import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import corsMiddleware from "./config/cors.js";
import csrfProtection from "./middleware/csrf.middleware.js";
import authRoutes from "./modules/auth/auth.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import memberRoutes from "./modules/members/member.routes.js";
import membershipRoutes from "./modules/memberships/membership.routes.js";
import planRoutes from "./modules/plans/plan.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import importRoutes from "./modules/imports/import.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";

import {
  notFound,
  errorHandler
} from "./middleware/error.middleware.js";

const app = express();

app.set("trust proxy", 1); // Trust first proxy for secure cookies
// Security
app.use(helmet());

app.use(csrfProtection);
app.use(corsMiddleware);

// Request parsing
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// API V1
const API_V1 = "/api/v1";

app.use(`${API_V1}/auth`, authRoutes);
app.use(`${API_V1}/dashboard`, dashboardRoutes);
app.use(`${API_V1}/members`, memberRoutes);
app.use(`${API_V1}/memberships`, membershipRoutes);
app.use(`${API_V1}/plans`, planRoutes);
app.use(`${API_V1}/payments`, paymentRoutes);
app.use(`${API_V1}/imports`, importRoutes);
app.use(`${API_V1}/reports`, reportRoutes);
// Root endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Gym Management API",
    version: "v1"
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;