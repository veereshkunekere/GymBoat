import { Readable } from "stream";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 50;
const HEADER_SCAN_ROWS = 15;

// --------------------------------------------------
// Column-name recognition
// --------------------------------------------------

export const FIELDS = [
  "name",
  "phone",
  "joinedAt",
  "email",
  "gender",
  "dateOfBirth",
  "address",
  "membershipStart",
  "membershipEnd",
];

// Exact (normalised) header names, most specific first.
const EXACT = {
  name: ["name", "membername", "fullname", "customername", "clientname", "studentname", "membersname"],
  phone: ["phone", "mobile", "phoneno", "phonenumber", "mobileno", "mobilenumber", "contact", "contactno", "contactnumber", "cell", "cellno", "whatsapp", "whatsappno", "whatsappnumber"],
  joinedAt: ["joindate", "joiningdate", "dateofjoining", "doj", "joined", "joinedon", "joinedat", "admissiondate", "dateofadmission", "registrationdate", "regdate", "enrollmentdate", "membersince"],
  email: ["email", "emailid", "emailaddress", "mail"],
  gender: ["gender", "sex"],
  dateOfBirth: ["dob", "dateofbirth", "birthdate", "birthday"],
  address: ["address", "residentialaddress", "homeaddress", "location", "area"],
  membershipStart: ["startdate", "membershipstart", "membershipstartdate", "planstart", "planstartdate", "packagestart"],
  membershipEnd: ["expiry", "expirydate", "expirydt", "enddate", "membershipend", "membershipenddate", "validtill", "validuntil", "validupto", "planend", "planenddate", "expiredon", "renewaldate"],
};

const NOT_NAME = /plan|trainer|father|mother|spouse|emergency|nominee|refer|company|branch|gym|package|batch|nick|guardian/;
const NOT_PHONE = /emergency|alternate|alt|father|mother|parent|guardian|office|work|landline|spouse/;

// Looser "contains" rules, used only when no exact match was found.
const CONTAINS = {
  name: (h) => h.includes("name") && !NOT_NAME.test(h),
  phone: (h) => /phone|mobile|contact|whatsapp/.test(h) && !NOT_PHONE.test(h),
  joinedAt: (h) => /join|admission|registration/.test(h),
  email: (h) => h.includes("mail"),
  gender: (h) => /gender|^sex/.test(h),
  dateOfBirth: (h) => /birth|dob/.test(h),
  address: (h) => h.includes("address"),
  membershipStart: (h) => /startdate|planstart|membershipstart/.test(h),
  membershipEnd: (h) => /expir|validtill|validupto|validuntil|enddate|membershipend|planend/.test(h),
};

const normalizeHeader = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Which field (if any) does this header look like?
export const matchHeader = (header) => {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const field of FIELDS) {
    if (EXACT[field].includes(h)) return field;
  }
  for (const field of FIELDS) {
    if (CONTAINS[field](h)) return field;
  }
  return null;
};

// headers -> { name: 0, phone: 3, ... } (column indexes). A column is used for one field only.
export const suggestMapping = (headers) => {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null]));
  const used = new Set();

  // Pass 1: exact names. Pass 2: loose matches.
  for (const pass of ["exact", "contains"]) {
    headers.forEach((header, index) => {
      if (used.has(index)) return;
      const h = normalizeHeader(header);
      if (!h) return;

      for (const field of FIELDS) {
        if (mapping[field] !== null) continue;
        const hit = pass === "exact" ? EXACT[field].includes(h) : CONTAINS[field](h);
        if (hit) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    });
  }

  return mapping;
};

// --------------------------------------------------
// Cell -> string
// --------------------------------------------------

const clean = (s) => String(s).replace(/\u00a0/g, " ").trim();

const cellToString = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return clean(value);

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return clean(value.richText.map((part) => part.text).join(""));
    }
    if ("result" in value) return cellToString(value.result); // formulas
    if ("text" in value) return cellToString(value.text); // hyperlinks
    if ("error" in value) return "";
  }

  return clean(value);
};

const columnLabel = (index) => {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Column ${label}`;
};

// --------------------------------------------------
// File -> grid
// --------------------------------------------------

const badFile = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Minimal RFC-4180 parser; delimiter sniffed from the first line. Keeps every value as text so
// phone numbers and dates are never converted behind our back.
const parseCsvText = (text) => {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch] += 1;
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const endRow = () => {
    row.push(field);
    field = "";
    records.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();

  return records.map((cells, i) => ({ rowNumber: i + 1, cells: cells.map(clean) }));
};

const decodeCsv = (buffer) => {
  const utf8 = buffer.toString("utf8");
  // Excel on Windows often saves CSV as Windows-1252; "�" means the UTF-8 decode was wrong.
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("windows-1252").decode(buffer);
};

// Files saved by some tools (openpyxl, Google Sheets exports, "Format as Table" in Excel) contain
// table definitions that exceljs cannot resolve and crashes on. We only need cell values, so the
// table parts are removed before loading.
const stripTables = async (buffer) => {
  try {
    const zip = await JSZip.loadAsync(buffer);

    for (const name of Object.keys(zip.files)) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        const xml = await zip.file(name).async("string");
        if (xml.includes("<tableParts")) {
          zip.file(name, xml.replace(/<tableParts[\s\S]*?<\/tableParts>/g, ""));
        }
      } else if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name)) {
        const xml = await zip.file(name).async("string");
        const cleaned = xml.replace(/<Relationship\b[^>]*relationships\/table"[^>]*\/>/g, "");
        if (cleaned !== xml) zip.file(name, cleaned);
      }
    }

    return await zip.generateAsync({ type: "nodebuffer" });
  } catch {
    return buffer; // not a readable zip: let the normal load report the problem
  }
};

const readXlsx = async (buffer) => {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(await stripTables(buffer));
  } catch (error) {
    console.error("XLSX parse failed:", error.message);
    throw badFile("Could not read this file. Make sure it is a valid .xlsx file");
  }

  const sheet = workbook.worksheets.find(
    (ws) => ws.state === "visible" && ws.actualRowCount > 0
  );

  if (!sheet) throw badFile("The file has no data");

  const rows = [];

  sheet.eachRow((row, rowNumber) => {
    // Stop reading absurdly large sheets early; the row limit is enforced after header detection.
    if (rows.length > MAX_ROWS + HEADER_SCAN_ROWS + 5) return;

    const width = Math.min(row.cellCount, MAX_COLUMNS);
    const cells = [];
    for (let c = 1; c <= width; c += 1) cells.push(cellToString(row.getCell(c).value));
    rows.push({ rowNumber, cells });
  });

  return { sheetName: sheet.name, rows };
};

/**
 * Parses an uploaded .xlsx / .csv into { sheetName, headerRowNumber, headers, rows, rowNumbers }.
 * - skips title/blank rows above the header (looks for the row that best resembles a header)
 * - every cell is a string; Excel date cells come back as YYYY-MM-DD
 */
export const parseUpload = async ({ buffer, originalname }) => {
  const isCsv = /\.csv$/i.test(originalname || "");

  const { sheetName, rows: allRows } = isCsv
    ? { sheetName: "", rows: parseCsvText(decodeCsv(buffer)) }
    : await readXlsx(buffer);

  const nonEmpty = allRows.filter((r) => r.cells.some((c) => c !== ""));
  if (!nonEmpty.length) throw badFile("The file is empty");

  // Header row = the row (within the first few) that matches the most known column names.
  let headerIdx = 0;
  let bestScore = 0;
  nonEmpty.slice(0, HEADER_SCAN_ROWS).forEach((r, i) => {
    const score = new Set(r.cells.map(matchHeader).filter(Boolean)).size;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  });

  const headerRow = nonEmpty[headerIdx];
  const width = Math.min(
    Math.max(headerRow.cells.length, ...nonEmpty.slice(headerIdx + 1, headerIdx + 200).map((r) => r.cells.length)),
    MAX_COLUMNS
  );

  const headers = Array.from({ length: width }, (_, i) => headerRow.cells[i] || columnLabel(i));

  const dataRows = nonEmpty.slice(headerIdx + 1);
  if (!dataRows.length) throw badFile("The file has a header row but no member rows");
  if (dataRows.length > MAX_ROWS) {
    throw badFile(`Too many rows (${dataRows.length}). Import up to ${MAX_ROWS} members at a time`);
  }

  return {
    sheetName,
    headerRowNumber: headerRow.rowNumber,
    headers,
    rows: dataRows.map((r) => Array.from({ length: width }, (_, i) => r.cells[i] ?? "")),
    rowNumbers: dataRows.map((r) => r.rowNumber),
  };
};
