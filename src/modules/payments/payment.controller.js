
import * as paymentService from "./payment.service.js";

export const recordPayment = async (req, res, next) => {
  try {
    const ownerId = req.user._id || req.user.id;

    const result = await paymentService.recordPayment(
      ownerId,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully. Awaiting verification.",
      data: result
    });

  } catch (error) {
    next(error);
  }
};

export const getOutstandingBalances = async (req, res, next) => {
  try {
    const data = await paymentService.getOutstandingBalances(
      req.user._id,
      req.query
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingPayments = async (req, res, next) => {
  try {
    const data = await paymentService.getPendingPayments(
      req.user._id,
      req.query
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistory = async (req, res, next) => {
  try {
    const data = await paymentService.getPaymentHistory(
      req.user._id,
      req.query
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentById = async (req, res, next) => {
  try {
    const data = await paymentService.getPaymentById(
      req.user._id,
      req.params.paymentId
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};


export const verifyPayment = async (req, res, next) => {
  try {
    const ownerId = req.user._id || req.user.id;

    const result = await paymentService.verifyPayment(
      ownerId,
      req.params.paymentId
    );

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const rejectPayment = async (req, res, next) => {
  try {
    const ownerId = req.user._id || req.user.id;

    const payment = await paymentService.rejectPayment(
      ownerId,
      req.params.paymentId,
      req.body.rejectionReason || ""
    );

    return res.status(200).json({
      success: true,
      message: "Payment rejected successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};
