
import Gym from "../models/Gym.js";

export const resolveGym = async (req, res, next) => {
  try {
    const gym = await Gym.findOne({
      ownerId: req.user._id
    });

    if (!gym) {
      return res.status(404).json({
        success: false,
        message: "Gym not found"
      });
    }

    if (!gym.isActive) {
      return res.status(403).json({
        success: false,
        message: "Gym account is inactive"
      });
    }

    req.gym = gym;

    next();
  } catch (error) {
    next(error);
  }
};
