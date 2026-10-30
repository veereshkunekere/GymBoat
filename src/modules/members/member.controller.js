
import * as memberService from "./member.service.js";
import validateMember from "./member.validation.js";

const handleError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A member with this phone number already exists"
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error"
  });
};

export const addMember = async (req, res) => {
  try {
    const errors = validateMember(req.body);

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        errors
      });
    }

    const member = await memberService.addMember(
      req.user,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Member added successfully",
      data: member
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMembers = async (req, res) => {
  try {
    const result = await memberService.getMembers(
      req.user,
      req.query
    );

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getMemberById = async (req, res) => {
  try {
    const member = await memberService.getMemberById(
      req.user,
      req.params.memberId
    );

    return res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateMember = async (req, res) => {
  try {
    const errors = validateMember(req.body, true);

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        errors
      });
    }

    const member = await memberService.updateMember(
      req.user,
      req.params.memberId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Member updated successfully",
      data: member
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const archiveMember = async (req, res) => {
  try {
    const member = await memberService.archiveMember(
      req.user,
      req.params.memberId
    );

    return res.status(200).json({
      success: true,
      message: "Member archived successfully",
      data: member
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const restoreMember = async (req, res) => {
  try {
    const member = await memberService.restoreMember(
      req.user,
      req.params.memberId
    );

    return res.status(200).json({
      success: true,
      message: "Member restored successfully",
      data: member
    });
  } catch (error) {
    return handleError(res, error);
  }
};
