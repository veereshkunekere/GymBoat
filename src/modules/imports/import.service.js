import mongoose from "mongoose";

import ImportJob from "../../models/ImportJob.js";
import Member from "../../models/Member.js";
import Membership from "../../models/Membership.js";
import Payment from "../../models/Payment.js";
import Plan from "../../models/Plan.js";

import { parseUpload, suggestMapping, FIELDS } from "./import.parser.js";
import { normalizePhone, validateRows } from "./import.validator.js";

const createError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const CHUNK = 500;
const MAX_STORED_FAILURES = 1000;
const MAX_RETURNED_ISSUES = 300;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Bulk inserts with ordered:false report duplicate-key problems as errors even though the rest of
// the batch was written. We tolerate those and read back what actually exists.
const isBulkWriteError = (e) =>
  e?.code === 11000 || e?.name === "MongoBulkWriteError" || Array.isArray(e?.writeErrors);

// --------------------------------------------------
// Loading + input checks
// --------------------------------------------------

const loadJob = async (gym, jobId, { withRows = false } = {}) => {
  if (!mongoose.isValidObjectId(jobId)) throw createError("Invalid import ID");

  let query = ImportJob.findOne({ _id: jobId, gymId: gym._id });
  if (withRows) query = query.select("+rows +rowNumbers");

  const job = await query;
  if (!job) throw createError("Import not found", 404);
  return job;
};

const parseConfig = async (gym, job, body = {}) => {
  // ---- mapping: { field: columnIndex | null }
  const input = body.mapping && typeof body.mapping === "object" ? body.mapping : {};
  const mapping = {};
  const usedColumns = new Map();

  for (const field of FIELDS) {
    const raw = input[field];
    if (raw === null || raw === undefined || raw === "") {
      mapping[field] = null;
      continue;
    }

    const idx = Number(raw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= job.headers.length) {
      throw createError(`Invalid column selected for ${field}`);
    }
    if (usedColumns.has(idx)) {
      throw createError(`"${job.headers[idx]}" is selected for more than one field`);
    }
    usedColumns.set(idx, field);
    mapping[field] = idx;
  }

  if (mapping.name === null) throw createError("Choose the column that contains the member name");
  if (mapping.phone === null) throw createError("Choose the column that contains the phone number");

  // ---- options
  const raw = body.options && typeof body.options === "object" ? body.options : {};
  const options = {
    planId: raw.planId || null,
    membershipStart: raw.membershipStart === "JOIN_DATE" ? "JOIN_DATE" : "TODAY",
    paymentStatus: raw.paymentStatus === "PAID" ? "PAID" : "UNPAID",
  };

  let plan = null;
  if (options.planId) {
    if (!mongoose.isValidObjectId(options.planId)) throw createError("Invalid plan");
    plan = await Plan.findOne({ _id: options.planId, gymId: gym._id, isActive: true }).lean();
    if (!plan) throw createError("Selected plan was not found or is inactive");
  }

  if (plan && options.membershipStart === "JOIN_DATE" && mapping.joinedAt === null) {
    throw createError("To start memberships from the join date, choose the Join date column");
  }

  return { mapping, options, plan };
};

// phone -> { name, isArchived } for every phone in the file that is already a member of this gym
const findExistingMembers = async (gym, job, mapping) => {
  const phones = new Set();
  for (const cells of job.rows) {
    const p = normalizePhone(cells[mapping.phone]);
    if (p.value) phones.add(p.value);
  }

  const existing = new Map();
  for (const part of chunk([...phones], 1000)) {
    const found = await Member.find({ gymId: gym._id, phone: { $in: part } })
      .select("phone name isArchived")
      .lean();
    found.forEach((m) => existing.set(m.phone, { name: m.name, isArchived: m.isArchived }));
  }
  return existing;
};

const runValidation = async (gym, job, config) => {
  const existing = await findExistingMembers(gym, job, config.mapping);
  return validateRows({
    rows: job.rows,
    rowNumbers: job.rowNumbers,
    mapping: config.mapping,
    options: config.options,
    plan: config.plan,
    existing,
  });
};

// --------------------------------------------------
// STEP 1: upload + parse
// --------------------------------------------------

export const createUpload = async ({ gym, ownerId, file }) => {
  if (!file) throw createError("Choose a .xlsx or .csv file to upload");

  const parsed = await parseUpload({ buffer: file.buffer, originalname: file.originalname });

  // Keep only one pending upload per gym (they hold personal data and are not needed again)
  await ImportJob.deleteMany({ gymId: gym._id, status: "UPLOADED" });

  const job = await ImportJob.create({
    gymId: gym._id,
    ownerId,
    fileName: file.originalname.slice(0, 200),
    fileSize: file.size,
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    headerRowNumber: parsed.headerRowNumber,
    totalRows: parsed.rows.length,
    rows: parsed.rows,
    rowNumbers: parsed.rowNumbers,
    expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
  });

  return {
    jobId: job._id,
    fileName: job.fileName,
    sheetName: job.sheetName,
    headerRowNumber: job.headerRowNumber,
    headers: job.headers,
    totalRows: job.totalRows,
    suggestedMapping: suggestMapping(job.headers),
    sampleRows: parsed.rows.slice(0, 5),
  };
};

// --------------------------------------------------
// STEP 2: dry-run (nothing is written except the remembered mapping)
// --------------------------------------------------

export const previewImport = async ({ gym, jobId, body }) => {
  const job = await loadJob(gym, jobId, { withRows: true });
  if (job.status !== "UPLOADED") throw createError("This import has already been processed", 409);

  const config = await parseConfig(gym, job, body);
  const { records, issues, summary } = await runValidation(gym, job, config);

  await ImportJob.updateOne(
    { _id: job._id },
    { $set: { mapping: config.mapping, options: config.options } }
  );

  // Errors first, then warnings
  const sorted = [...issues].sort(
    (a, b) => (a.level === b.level ? a.rowNumber - b.rowNumber : a.level === "error" ? -1 : 1)
  );

  return {
    summary,
    plan: config.plan
      ? { name: config.plan.name, durationDays: config.plan.durationDays, price: config.plan.price }
      : null,
    issues: sorted.slice(0, MAX_RETURNED_ISSUES),
    issuesTruncated: sorted.length > MAX_RETURNED_ISSUES,
    sample: records.slice(0, 5).map((r) => ({
      rowNumber: r.rowNumber,
      ...r.member,
      membership: r.membership
        ? {
            startDate: r.membership.startDate,
            endDate: r.membership.endDate,
            status: r.membership.status,
            paymentStatus: r.membership.paymentStatus,
          }
        : null,
    })),
  };
};

// --------------------------------------------------
// STEP 3: commit
// --------------------------------------------------

export const commitImport = async ({ gym, jobId, body }) => {
  let job = await loadJob(gym, jobId, { withRows: true });
  if (job.status !== "UPLOADED") throw createError("This import has already been processed", 409);

  const config = await parseConfig(gym, job, body);

  // Atomically claim the job so a double click / second tab cannot import twice
  const claimed = await ImportJob.findOneAndUpdate(
    { _id: job._id, gymId: gym._id, status: "UPLOADED" },
    { $set: { status: "COMMITTING", startedAt: new Date(), mapping: config.mapping, options: config.options } },
    { returnDocument: "after" }
  ).select("+rows +rowNumbers");

  if (!claimed) throw createError("This import is already running or finished", 409);
  job = claimed;

  try {
    const { records, issues, summary } = await runValidation(gym, job, config);

    // ---- members
    const failures = issues
      .filter((i) => i.level === "error")
      .map((i) => ({
        rowNumber: i.rowNumber,
        name: i.name,
        phone: String(i.phone ?? ""),
        reason: i.messages[0],
      }));

    for (const part of chunk(records, CHUNK)) {
      try {
        await Member.insertMany(
          part.map((r) => ({ gymId: gym._id, importJobId: job._id, ...r.member })),
          { ordered: false }
        );
      } catch (e) {
        if (!isBulkWriteError(e)) throw e;
      }
    }

    // What was really written (also covers a phone that appeared in the meantime)
    const created = await Member.find({ gymId: gym._id, importJobId: job._id })
      .select("_id phone")
      .lean();
    const idByPhone = new Map(created.map((m) => [m.phone, m._id]));

    records.forEach((r) => {
      if (!idByPhone.has(r.member.phone)) {
        failures.push({
          rowNumber: r.rowNumber,
          name: r.member.name,
          phone: r.member.phone,
          reason: "Phone number was added by someone else during the import",
        });
      }
    });

    // ---- memberships
    let membershipsExpected = 0;
    if (config.plan) {
      const docs = records
        .filter((r) => r.membership && idByPhone.has(r.member.phone))
        .map((r) => ({
          gymId: gym._id,
          memberId: idByPhone.get(r.member.phone),
          importJobId: job._id,
          ...r.membership,
        }));
      membershipsExpected = docs.length;

      for (const part of chunk(docs, CHUNK)) {
        try {
          await Membership.insertMany(part, { ordered: false });
        } catch (e) {
          if (!isBulkWriteError(e)) throw e;
        }
      }
    }

    const membershipsCreated = config.plan
      ? await Membership.countDocuments({ gymId: gym._id, importJobId: job._id })
      : 0;

    const message =
      membershipsCreated < membershipsExpected
        ? `${membershipsExpected - membershipsCreated} members were created without a membership. Assign one from the Members page.`
        : "";

    const result = {
      membersCreated: created.length,
      membershipsCreated,
      skipped: failures.length,
      warnings: summary.withWarnings,
      failures: failures.slice(0, MAX_STORED_FAILURES),
      failuresTruncated: failures.length > MAX_STORED_FAILURES,
      message,
    };

    // Personal data is dropped from the job once the import is done
    await ImportJob.updateOne(
      { _id: job._id },
      {
        $set: { status: "COMPLETED", completedAt: new Date(), result, rows: [], rowNumbers: [] },
        $unset: { expiresAt: 1 },
      }
    );

    return { jobId: job._id, status: "COMPLETED", summary, result };
  } catch (error) {
    await ImportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "FAILED",
          completedAt: new Date(),
          "result.message": "Import stopped because of a server error. Members already created are kept.",
        },
        $unset: { expiresAt: 1 },
      }
    ).catch(() => {});
    throw error;
  }
};

// --------------------------------------------------
// Undo: removes everything this import created, but only if it is untouched
// --------------------------------------------------

export const undoImport = async ({ gym, jobId }) => {
  const job = await loadJob(gym, jobId);
  if (!["COMPLETED", "FAILED"].includes(job.status)) {
    throw createError("Only a finished import can be undone", 409);
  }

  const members = await Member.find({ gymId: gym._id, importJobId: job._id }).select("_id").lean();
  const memberIds = members.map((m) => m._id);

  if (!memberIds.length) throw createError("This import created no members", 409);

  const [payments, otherMemberships] = await Promise.all([
    Payment.countDocuments({ gymId: gym._id, memberId: { $in: memberIds } }),
    Membership.countDocuments({
      gymId: gym._id,
      memberId: { $in: memberIds },
      importJobId: { $ne: job._id },
    }),
  ]);

  if (payments || otherMemberships) {
    throw createError(
      "Some imported members already have payments or newer memberships, so this import cannot be undone safely. Archive those members individually instead.",
      409
    );
  }

  const [ms, mb] = await Promise.all([
    Membership.deleteMany({ gymId: gym._id, importJobId: job._id }),
    Member.deleteMany({ gymId: gym._id, importJobId: job._id }),
  ]);

  job.status = "UNDONE";
  await job.save();

  return { membersRemoved: mb.deletedCount, membershipsRemoved: ms.deletedCount };
};

// --------------------------------------------------
// Read endpoints
// --------------------------------------------------

export const getImport = async ({ gym, jobId }) => loadJob(gym, jobId);

export const listImports = async ({ gym }) =>
  ImportJob.find({ gymId: gym._id, status: { $ne: "UPLOADED" } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("fileName status totalRows result.membersCreated result.membershipsCreated result.skipped createdAt completedAt")
    .lean();
