export const validatePlan = (data, isUpdate = false) => {
  const errors = {};

  if (!isUpdate || data.name !== undefined) {
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.trim().length > 50
    ) {
      errors.name = "Valid plan name is required (maximum 50 characters)";
    }
  }

  if (!isUpdate || data.durationDays !== undefined) {
    if (
      !Number.isInteger(data.durationDays) ||
      data.durationDays < 1
    ) {
      errors.durationDays = "Duration must be a positive integer";
    }
  }

  if (!isUpdate || data.price !== undefined) {
    if (
      typeof data.price !== "number" ||
      !Number.isFinite(data.price) ||
      data.price < 0
    ) {
      errors.price = "Price must be a valid non-negative number";
    }
  }

  if (
    data.description !== undefined &&
    (typeof data.description !== "string" ||
      data.description.length > 300)
  ) {
    errors.description = "Description cannot exceed 300 characters";
  }

  return errors;
};