
import jwt from "jsonwebtoken";

import Owner from "../models/Owner.js";
import { env } from "../config/env.js";

const authenticateOwner = async (req, res, next) => {
  try {
    const token = req.cookies?.[env.JWT_COOKIE_NAME];

console.log("AUTH DEBUG:", {
  cookieName: env.JWT_COOKIE_NAME,
  cookiesReceived: Object.keys(req.cookies || {}),
  tokenReceived: Boolean(token),
});
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET, {
  algorithms: ["HS256"],
  issuer: "sweatboat-api",
  audience: "sweatboat-web"
});

    if (!decoded.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token"
      });
    }

    const owner = await Owner.findById(decoded.sub);

    if (!owner || !owner.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account"
      });
    }

    req.user = owner;

    next();
  } catch (error) {
  console.error("AUTH ERROR:", error.name, error.message);

  if (
    error.name === "JsonWebTokenError" ||
    error.name === "TokenExpiredError"
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token"
    });
  }

  next(error);
}
};

export default authenticateOwner;
