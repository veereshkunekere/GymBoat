import mongoose from "mongoose";
import { env } from "../../config/env.js";
import Gym from "../../models/Gym.js";
import Member from "../../models/Member.js";
import Membership from "../../models/Membership.js";
import WhatsAppNotification from "../../models/WhatsAppNotification.js";

export const isWhatsAppConfigured = () => Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  // GymBoat currently collects Indian 10-digit mobile numbers. E.164 is required by Meta.
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{10,15}$/.test(e164)) throw Object.assign(new Error("Enter a valid phone number with country code"), { statusCode: 400 });
  return e164;
};

const sendTemplate = async ({ phone, templateName, parameters = [] }) => {
  if (!isWhatsAppConfigured()) throw Object.assign(new Error("WhatsApp Cloud API is not configured on the server"), { statusCode: 503 });
  if (!/^[a-z0-9_]{3,80}$/.test(templateName)) throw Object.assign(new Error("Invalid WhatsApp template name"), { statusCode: 400 });
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
      ...(parameters.length ? { components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text: String(text).slice(0, 1024) })) }] } : {}),
    },
  };
  const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.error_user_msg || data?.error?.message || "WhatsApp provider rejected the message";
    throw Object.assign(new Error(message), { statusCode: 502 });
  }
  return data?.messages?.[0]?.id || null;
};

const deliver = async ({ gymId, member, phone, type, templateName, parameters, idempotencyKey }) => {
  const normalized = normalizePhone(phone);
  const log = await WhatsAppNotification.create({ gymId, memberId: member?._id || null, phone: normalized, type, templateName, idempotencyKey, status: "QUEUED" });
  try {
    const providerMessageId = await sendTemplate({ phone: normalized, templateName, parameters });
    log.status = "SENT";
    log.providerMessageId = providerMessageId;
    log.sentAt = new Date();
    await log.save();
    return log;
  } catch (error) {
    log.status = "FAILED";
    log.errorMessage = String(error.message || "Delivery failed").slice(0, 500);
    await log.save();
    throw error;
  }
};

const getGym = async (ownerId) => {
  const gym = await Gym.findOne({ ownerId, isActive: true });
  if (!gym) throw Object.assign(new Error("Gym not found or inactive"), { statusCode: 404 });
  return gym;
};

export const getOverview = async (ownerId) => {
  const gym = await getGym(ownerId);
  const [total, sent, failed, recent] = await Promise.all([
    WhatsAppNotification.countDocuments({ gymId: gym._id }),
    WhatsAppNotification.countDocuments({ gymId: gym._id, status: "SENT" }),
    WhatsAppNotification.countDocuments({ gymId: gym._id, status: "FAILED" }),
    WhatsAppNotification.find({ gymId: gym._id }).sort({ createdAt: -1 }).limit(50).populate("memberId", "name phone").lean(),
  ]);
  return { configured: isWhatsAppConfigured(), settings: gym.whatsappNotifications || { enabled: false, expiryReminders: true, reminderDays: [7, 3, 1] }, stats: { total, sent, failed }, notifications: recent };
};

export const updateSettings = async (ownerId, input) => {
  const gym = await getGym(ownerId);
  const current = gym.whatsappNotifications || {};
  if (input.enabled !== undefined) current.enabled = Boolean(input.enabled);
  if (input.expiryReminders !== undefined) current.expiryReminders = Boolean(input.expiryReminders);
  if (input.reminderDays !== undefined) {
    if (!Array.isArray(input.reminderDays) || input.reminderDays.length > 5 || input.reminderDays.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) {
      throw Object.assign(new Error("Reminder days must be whole numbers between 1 and 30 (maximum 5 values)"), { statusCode: 400 });
    }
    current.reminderDays = [...new Set(input.reminderDays)].sort((a, b) => b - a);
  }
  gym.whatsappNotifications = current;
  await gym.save();
  return gym.whatsappNotifications;
};

export const sendToMember = async (ownerId, { memberId, templateName, parameters = [] }) => {
  if (!mongoose.isValidObjectId(memberId)) throw Object.assign(new Error("Invalid member ID"), { statusCode: 400 });
  if (!Array.isArray(parameters) || parameters.length > 8 || parameters.some((p) => typeof p !== "string" || p.length > 200)) throw Object.assign(new Error("Invalid template parameters"), { statusCode: 400 });
  const gym = await getGym(ownerId);
  const member = await Member.findOne({ _id: memberId, gymId: gym._id, isArchived: false });
  if (!member) throw Object.assign(new Error("Member not found"), { statusCode: 404 });
  if (!member.whatsappOptIn) throw Object.assign(new Error("This member has not opted in to WhatsApp notifications"), { statusCode: 403 });
  return deliver({ gymId: gym._id, member, phone: member.phone, type: "MANUAL", templateName, parameters });
};

export const sendTest = async (ownerId, { phone }) => {
  const gym = await getGym(ownerId);
  // Requires an approved template named gym_test_message with one body variable (gym name).
  return deliver({ gymId: gym._id, phone, type: "TEST", templateName: "gym_test_message", parameters: [gym.name] });
};

// Asia/Kolkata day boundary represented as UTC midnight; membership dates in this app are date-only UTC values.
const todayInIndia = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day)));
};

export const runExpiryReminders = async () => {
  if (!isWhatsAppConfigured()) return { skipped: "WhatsApp is not configured" };
  const gyms = await Gym.find({ isActive: true, "whatsappNotifications.enabled": true, "whatsappNotifications.expiryReminders": true });
  let sent = 0, skipped = 0, failed = 0;
  const today = todayInIndia();
  for (const gym of gyms) {
    const days = gym.whatsappNotifications?.reminderDays?.length ? gym.whatsappNotifications.reminderDays : [7, 3, 1];
    for (const day of days) {
      const target = new Date(today.getTime() + day * 86400000);
      const next = new Date(target.getTime() + 86400000);
      const memberships = await Membership.find({ gymId: gym._id, status: "ACTIVE", endDate: { $gte: target, $lt: next } }).populate("memberId", "name phone whatsappOptIn isArchived");
      for (const membership of memberships) {
        const member = membership.memberId;
        if (!member || member.isArchived || !member.whatsappOptIn) { skipped++; continue; }
        const key = `expiry:${membership._id}:${day}:${target.toISOString().slice(0, 10)}`;
        try {
          await deliver({ gymId: gym._id, member, phone: member.phone, type: "EXPIRY_REMINDER", templateName: "gym_membership_expiry", parameters: [member.name, String(day), membership.planName], idempotencyKey: key });
          sent++;
        } catch (error) {
          if (error.code === 11000) skipped++;
          else { failed++; console.error("[WhatsApp expiry reminder]", error.message); }
        }
      }
    }
  }
  return { sent, skipped, failed };
};
