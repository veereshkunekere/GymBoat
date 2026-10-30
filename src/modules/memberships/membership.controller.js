import * as membershipService from "./membership.service.js";

// ASSIGN
export const assignMembership = async (req, res, next) => {
  try {
    const membership =
      await membershipService.assignMembership(
        req.user._id,
        req.body
      );

    return res.status(201).json({
      success: true,
      message: "Membership assigned successfully",
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL
export const getMemberships = async (req, res, next) => {
  try {
    const result = await membershipService.getMemberships(
      req.user._id,
      req.query
    );

    return res.status(200).json({
      success: true,
      data: result.memberships,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// GET SINGLE
export const getMembershipById = async (req, res, next) => {
  try {
    const membership =
      await membershipService.getMembershipById(
        req.user._id,
        req.params.membershipId
      );

    return res.status(200).json({
      success: true,
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

// RENEW
export const renewMembership = async (req, res, next) => {
  try {
    const membership =
      await membershipService.renewMembership(
        req.user._id,
        req.params.membershipId,
        req.body
      );

    return res.status(201).json({
      success: true,
      message: "Membership renewed successfully",
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

// PAUSE
export const pauseMembership = async (req, res, next) => {
  try {
    const membership =
      await membershipService.pauseMembership(
        req.user._id,
        req.params.membershipId
      );

    return res.status(200).json({
      success: true,
      message: "Membership paused successfully",
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

// RESUME
export const resumeMembership = async (req, res, next) => {
  try {
    const membership =
      await membershipService.resumeMembership(
        req.user._id,
        req.params.membershipId
      );

    return res.status(200).json({
      success: true,
      message: "Membership resumed successfully",
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};

// CANCEL
export const cancelMembership = async (req, res, next) => {
  try {
    const membership =
      await membershipService.cancelMembership(
        req.user._id,
        req.params.membershipId
      );

    return res.status(200).json({
      success: true,
      message: "Membership cancelled successfully",
      data: membership,
    });
  } catch (error) {
    next(error);
  }
};