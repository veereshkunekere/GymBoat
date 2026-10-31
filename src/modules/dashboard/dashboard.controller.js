
import { getDashboardData } from "./dashboard.service.js";

export const getDashboard = async (req, res, next) => {
  try {
    const ownerId =
      req.user?._id ||
      req.user?.id ||
      req.user?.userId;

    if (!ownerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const data = await getDashboardData(ownerId);

    return res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
