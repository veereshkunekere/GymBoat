
const validateMember = (data, isUpdate = false) => {
  const errors = {};

  if (!isUpdate || data.name !== undefined) {
    if (!data.name || !data.name.trim()) {
      errors.name = "Member name is required";
    }
  }

  if (!isUpdate || data.phone !== undefined) {
    const phone = String(data.phone || "").replace(/\D/g, "");

    if (!/^\d{10}$/.test(phone)) {
      errors.phone = "Enter a valid 10-digit phone number";
    }
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Enter a valid email address";
  }

  if (
    data.gender !== undefined &&
    !["MALE", "FEMALE", "OTHER"].includes(data.gender)
  ) {
    errors.gender = "Invalid gender";
  }

  if (data.dateOfBirth) {
    const dob = new Date(data.dateOfBirth);

    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      errors.dateOfBirth = "Invalid date of birth";
    }
  }

  return errors;
};

export default validateMember;
