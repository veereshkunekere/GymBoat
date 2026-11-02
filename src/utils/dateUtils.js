// Calendar-date helpers. The app stores calendar dates as UTC midnight (same convention as
// membership.service.js), and "today" is evaluated in the gym's timezone (IST).

export const utcDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

export const todayInIST = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return utcDate(Number(v.year), Number(v.month), Number(v.day));
};

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export const daysBetween = (start, end) =>
  Math.round((end.getTime() - start.getTime()) / 86400000);

export const toISODate = (date) => date.toISOString().slice(0, 10);

// Same rule as membership.service.js getCurrentStatus (start/end are inclusive).
export const membershipStatusFor = (start, end, today = todayInIST()) => {
  if (today < start) return "UPCOMING";
  if (today > end) return "EXPIRED";
  return "ACTIVE";
};
