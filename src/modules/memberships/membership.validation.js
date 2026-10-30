import mongoose from "mongoose";

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

export const validateAssignment = (data) => {
  const errors = {};

  if (!isValidId(data.memberId)) {
    errors.memberId = "Valid memberId is required";
  }

  if (!isValidId(data.planId)) {
    errors.planId = "Valid planId is required";
  }

  if (
    data.startDate !== undefined &&
    (
      typeof data.startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ||
      Number.isNaN(Date.parse(`${data.startDate}T00:00:00.000Z`)) ||
      new Date(`${data.startDate}T00:00:00.000Z`)
        .toISOString().slice(0, 10) !== data.startDate
    )
  ) {
    errors.startDate = "Start date must be a valid YYYY-MM-DD date";
  }

  if (
    data.discount !== undefined &&
    (
      typeof data.discount !== "number" ||
      !Number.isFinite(data.discount) ||
      data.discount < 0
    )
  ) {
    errors.discount = "Discount must be a non-negative number";
  }

  if (
    data.paidAmount !== undefined &&
    (
      typeof data.paidAmount !== "number" ||
      !Number.isFinite(data.paidAmount) ||
      data.paidAmount < 0
    )
  ) {
    errors.paidAmount = "Paid amount must be a non-negative number";
  }

  return errors;
};

export const validateMembershipId = (membershipId) => {
  return isValidId(membershipId);
};

export const validateRenewal = (data) => {
  const errors = {};

  if (
    data.planId !== undefined &&
    !isValidId(data.planId)
  ) {
    errors.planId = "Invalid planId";
  }

  if (
    data.discount !== undefined &&
    (
      typeof data.discount !== "number" ||
      !Number.isFinite(data.discount) ||
      data.discount < 0
    )
  ) {
    errors.discount = "Invalid discount";
  }

  if (
    data.paidAmount !== undefined &&
    (
      typeof data.paidAmount !== "number" ||
      !Number.isFinite(data.paidAmount) ||
      data.paidAmount < 0
    )
  ) {
    errors.paidAmount = "Invalid paid amount";
  }

  return errors;
};