import {
  utcDate,
  addDays,
  daysBetween,
  todayInIST,
  membershipStatusFor,
} from "../../utils/dateUtils.js";

// --------------------------------------------------
// Field normalisers. Each returns { value, warning?, error? }
// --------------------------------------------------

const short = (s, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);

export const normalizePhone = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return { error: "Phone is required" };

  // Excel turned a long number into 9.87654E+09 - the digits are already lost.
  if (/^\d(\.\d+)?e\+?\d+$/i.test(text)) {
    return {
      error: "Phone was shortened by Excel (scientific notation). Format the phone column as Text and re-enter it",
    };
  }

  const candidates = text.split(/[,;/&|\n]| or | and /i).map((t) => t.trim()).filter(Boolean);
  let warning;

  for (const candidate of candidates) {
    let digits = candidate.replace(/\D/g, "");

    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    else if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);

    if (!/^\d{10}$/.test(digits)) continue;

    if (/^(\d)\1{9}$/.test(digits)) {
      return { error: `Phone "${short(text)}" looks like a placeholder` };
    }

    if (candidates.length > 1) warning = "Multiple phone numbers in one cell, used the first valid one";
    else if (!/^[6-9]/.test(digits)) warning = "Phone does not look like an Indian mobile number";

    return { value: digits, warning };
  }

  return { error: `Phone "${short(text)}" is not a valid 10-digit number` };
};

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const fullYear = (yy, todayYear) => {
  if (yy >= 100) return yy;
  // 2-digit year: pick the century that is not in the future (24 -> 2024, 85 -> 1985).
  return 2000 + yy <= todayYear + 1 ? 2000 + yy : 1900 + yy;
};

const buildDate = (y, m, d) => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = utcDate(y, m, d);
  // Reject 31 Feb etc. (JS would silently roll over to March)
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
};

/**
 * Parses a date written in a spreadsheet. Slash/dash/dot dates are read DAY-FIRST (dd/mm/yyyy),
 * the Indian convention, unless the second number is above 12 (then it must be mm/dd/yyyy).
 * Returns { date } | { empty: true } | { error }.
 */
export const parseDate = (raw, todayYear = new Date().getUTCFullYear()) => {
  const text = String(raw ?? "").trim();
  if (!text) return { empty: true };

  let m;

  // 2024-03-15 or 2024-03-15T10:00:00
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/))) {
    const date = buildDate(+m[1], +m[2], +m[3]);
    return date ? { date } : { error: `"${short(text)}" is not a real date` };
  }

  // 15/03/2024, 15-03-24, 15.03.2024 (optional time after)
  if ((m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/))) {
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) [day, month] = [month, day]; // mm/dd/yyyy
    const date = buildDate(fullYear(+m[3], todayYear), month, day);
    return date ? { date } : { error: `"${short(text)}" is not a real date` };
  }

  // 15 Mar 2024, 15-Mar-24, 15th March 2024
  if ((m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})(?!\d)/))) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const date = month ? buildDate(fullYear(+m[3], todayYear), month, +m[1]) : null;
    return date ? { date } : { error: `"${short(text)}" is not a real date` };
  }

  // Mar 15, 2024
  if ((m = text.match(/^([A-Za-z]{3,9})[\s\-.]+(\d{1,2})(?:st|nd|rd|th)?[,\s\-.]+(\d{2}|\d{4})(?!\d)/))) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const date = month ? buildDate(fullYear(+m[3], todayYear), month, +m[2]) : null;
    return date ? { date } : { error: `"${short(text)}" is not a real date` };
  }

  // Excel serial number that arrived as text/number, e.g. 45366
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial >= 20000 && serial <= 80000) {
      return { date: addDays(utcDate(1899, 12, 30), serial) };
    }
  }

  return { error: `"${short(text)}" is not a recognised date` };
};

export const normalizeGender = (raw) => {
  const t = String(raw ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return { value: "OTHER" };
  if (["m", "male", "man", "boy", "gent", "gents"].includes(t)) return { value: "MALE" };
  if (["f", "female", "woman", "girl", "lady", "ladies"].includes(t)) return { value: "FEMALE" };
  if (["o", "other", "others", "nonbinary", "na", "notspecified"].includes(t)) return { value: "OTHER" };
  return { value: "OTHER", warning: `Gender "${short(String(raw))}" not recognised, set to Other` };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --------------------------------------------------
// Membership calculation for one row
// --------------------------------------------------

const getPaymentStatus = (paid, final) => {
  if (paid <= 0) return "UNPAID";
  if (paid >= final) return "PAID";
  return "PARTIALLY_PAID";
};

/**
 * Builds the membership an imported member will get.
 *   expiry column present, no start column -> membership ENDS on that date and lasts plan.durationDays
 *   start column present                   -> starts there; ends at expiry column, else start + duration
 *   neither                                -> starts on join date or today (owner's choice)
 */
const buildMembership = ({ plan, options, joinedAt, startCol, endCol, today }) => {
  const notes = [];
  let start;
  let end;

  const endValid = endCol && endCol.date;
  const startValid = startCol && startCol.date;

  if (startValid) {
    start = startCol.date;
    if (endValid && endCol.date >= start) end = endCol.date;
    else {
      if (endValid) notes.push("Expiry date is before the start date, ignored");
      end = addDays(start, plan.durationDays - 1);
    }
  } else if (endValid) {
    end = endCol.date;
    start = addDays(end, -(plan.durationDays - 1));
  } else {
    start = options.membershipStart === "JOIN_DATE" && joinedAt ? joinedAt : today;
    end = addDays(start, plan.durationDays - 1);
  }

  const finalPrice = plan.price;
  const paidAmount = options.paymentStatus === "PAID" ? finalPrice : 0;

  return {
    notes,
    membership: {
      planId: plan._id,
      planName: plan.name,
      durationDays: daysBetween(start, end) + 1,
      originalPrice: plan.price,
      discount: 0,
      finalPrice,
      paidAmount,
      dueAmount: finalPrice - paidAmount,
      paymentStatus: getPaymentStatus(paidAmount, finalPrice),
      startDate: start,
      endDate: end,
      status: membershipStatusFor(start, end, today),
    },
  };
};

// --------------------------------------------------
// Whole-file validation (used by both preview and commit)
// --------------------------------------------------

const cell = (cells, mapping, field) => {
  const idx = mapping[field];
  if (idx === null || idx === undefined || idx === "") return "";
  return String(cells[Number(idx)] ?? "").trim();
};

/**
 * @param rows          string[][]  data rows
 * @param rowNumbers    number[]    original sheet row numbers
 * @param mapping       { field: columnIndex | null }
 * @param options       { planId, membershipStart: "TODAY"|"JOIN_DATE", paymentStatus: "PAID"|"UNPAID" }
 * @param plan          Plan | null   the default plan (already verified to belong to the gym)
 * @param existing      Map<phone, { name, isArchived }>   members already in this gym
 */
export const validateRows = ({ rows, rowNumbers, mapping, options, plan, existing }) => {
  const today = todayInIST();
  const todayYear = today.getUTCFullYear();

  const records = [];
  const issues = [];
  const seenPhones = new Map(); // phone -> first row number
  const summary = {
    totalRows: rows.length,
    ignoredBlankRows: 0,
    ready: 0,
    withWarnings: 0,
    errors: 0,
    existingMembers: 0,
    duplicatesInFile: 0,
    membership: { ACTIVE: 0, EXPIRED: 0, UPCOMING: 0 },
    totalDue: 0,
  };

  rows.forEach((cells, i) => {
    const rowNumber = rowNumbers[i];
    const errors = [];
    const warnings = [];

    const rawName = cell(cells, mapping, "name");
    const rawPhone = cell(cells, mapping, "phone");

    // Stray blank / totals rows with no identity at all
    if (!rawName && !rawPhone) {
      summary.ignoredBlankRows += 1;
      return;
    }

    // ---- name
    const name = rawName.replace(/\s+/g, " ");
    if (!name) errors.push("Name is required");
    else if (name.length > 100) errors.push("Name is longer than 100 characters");

    // ---- phone
    const phone = normalizePhone(rawPhone);
    if (phone.error) errors.push(phone.error);
    else if (phone.warning) warnings.push(phone.warning);

    // ---- email
    let email = null;
    const rawEmail = cell(cells, mapping, "email").split(/[,;\s]/)[0].toLowerCase();
    if (rawEmail) {
      if (EMAIL_RE.test(rawEmail)) email = rawEmail;
      else warnings.push(`Email "${short(rawEmail)}" is invalid and was left blank`);
    }

    // ---- gender
    const gender = normalizeGender(cell(cells, mapping, "gender"));
    if (gender.warning) warnings.push(gender.warning);

    // ---- address
    let address = cell(cells, mapping, "address").replace(/\s+/g, " ");
    if (address.length > 300) {
      address = address.slice(0, 300);
      warnings.push("Address was longer than 300 characters and was cut");
    }

    // ---- dates
    const joined = parseDate(cell(cells, mapping, "joinedAt"), todayYear);
    let joinedAt = today;
    if (joined.date) {
      joinedAt = joined.date;
      if (joinedAt > today) warnings.push("Join date is in the future");
    } else if (joined.error) {
      warnings.push(`Join date: ${joined.error}. Used today instead`);
    } else if (mapping.joinedAt !== null && mapping.joinedAt !== undefined) {
      warnings.push("Join date is empty. Used today instead");
    }

    let dateOfBirth;
    const dob = parseDate(cell(cells, mapping, "dateOfBirth"), todayYear);
    if (dob.date) {
      if (dob.date > today) warnings.push("Date of birth is in the future and was left blank");
      else dateOfBirth = dob.date;
    } else if (dob.error) {
      warnings.push(`Date of birth: ${dob.error}. Left blank`);
    }

    const startCol = parseDate(cell(cells, mapping, "membershipStart"), todayYear);
    const endCol = parseDate(cell(cells, mapping, "membershipEnd"), todayYear);
    if (startCol.error) warnings.push(`Membership start: ${startCol.error}. Ignored`);
    if (endCol.error) warnings.push(`Membership expiry: ${endCol.error}. Ignored`);

    // ---- duplicates (only for rows that are otherwise fine)
    if (!errors.length) {
      const firstRow = seenPhones.get(phone.value);
      const inDb = existing.get(phone.value);

      if (firstRow !== undefined) {
        errors.push(`Same phone number as row ${firstRow} in this file`);
        summary.duplicatesInFile += 1;
      } else if (inDb) {
        errors.push(
          inDb.isArchived
            ? `Phone already belongs to archived member "${inDb.name}". Restore them from the Archived list`
            : `Phone already belongs to existing member "${inDb.name}"`
        );
        summary.existingMembers += 1;
      } else {
        seenPhones.set(phone.value, rowNumber);
      }
    }

    // ---- result
    if (errors.length) {
      summary.errors += 1;
      issues.push({
        rowNumber,
        level: "error",
        name: name || "",
        phone: rawPhone,
        messages: errors, // warnings on a skipped row would only add noise
      });
      return;
    }

    let membership = null;
    if (plan) {
      const built = buildMembership({ plan, options, joinedAt, startCol, endCol, today });
      membership = built.membership;
      warnings.push(...built.notes);
      summary.membership[membership.status] = (summary.membership[membership.status] || 0) + 1;
      summary.totalDue += membership.dueAmount;
    }

    summary.ready += 1;
    if (warnings.length) {
      summary.withWarnings += 1;
      issues.push({ rowNumber, level: "warning", name, phone: phone.value, messages: warnings });
    }

    records.push({
      rowNumber,
      warnings: warnings.length,
      member: {
        name,
        phone: phone.value,
        email,
        gender: gender.value,
        address,
        dateOfBirth,
        joinedAt,
      },
      membership,
    });
  });

  return { records, issues, summary };
};
