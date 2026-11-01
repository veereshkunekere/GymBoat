import * as service from "./import.service.js";

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const upload = async (req, res, next) => {
  try {
    ok(res, await service.createUpload({ gym: req.gym, ownerId: req.user._id, file: req.file }), 201);
  } catch (error) {
    next(error);
  }
};

export const preview = async (req, res, next) => {
  try {
    ok(res, await service.previewImport({ gym: req.gym, jobId: req.params.jobId, body: req.body }));
  } catch (error) {
    next(error);
  }
};

export const commit = async (req, res, next) => {
  try {
    ok(res, await service.commitImport({ gym: req.gym, jobId: req.params.jobId, body: req.body }));
  } catch (error) {
    next(error);
  }
};

export const undo = async (req, res, next) => {
  try {
    ok(res, await service.undoImport({ gym: req.gym, jobId: req.params.jobId }));
  } catch (error) {
    next(error);
  }
};

export const get = async (req, res, next) => {
  try {
    ok(res, await service.getImport({ gym: req.gym, jobId: req.params.jobId }));
  } catch (error) {
    next(error);
  }
};

export const list = async (req, res, next) => {
  try {
    ok(res, await service.listImports({ gym: req.gym }));
  } catch (error) {
    next(error);
  }
};
