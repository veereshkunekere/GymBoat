import * as planService from "./plan.service.js";

export const createPlan = async (req, res, next) => {
  try {
    const plan = await planService.createPlan(
      req.user._id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Plan created successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlans = async (req, res, next) => {
  try {
    const plans = await planService.getPlans(
      req.user._id,
      req.query
    );

    return res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlanById = async (req, res, next) => {
  try {
    const plan = await planService.getPlanById(
      req.user._id,
      req.params.planId
    );

    return res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const plan = await planService.updatePlan(
      req.user._id,
      req.params.planId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePlanStatus = async (req, res, next) => {
  try {
    const plan = await planService.updatePlanStatus(
      req.user._id,
      req.params.planId,
      req.body.isActive
    );

    return res.status(200).json({
      success: true,
      message: "Plan status updated successfully",
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};