import cron from "node-cron";
import Membership from "../models/Membership.js";

const TIMEZONE = "Asia/Kolkata";

const getToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day)
    )
  );
};

export const reconcileMembershipStatuses = async () => {
  const today = getToday();

  // Expire memberships whose end date has passed
  const expired = await Membership.updateMany(
    {
      status: { $in: ["ACTIVE", "UPCOMING"] },
      endDate: { $lt: today },
    },
    {
      $set: { status: "EXPIRED" },
    }
  );

  // Activate memberships whose start date has arrived
  const activated = await Membership.updateMany(
    {
      status: "UPCOMING",
      startDate: { $lte: today },
      endDate: { $gte: today },
    },
    {
      $set: { status: "ACTIVE" },
    }
  );

  console.log(
    `[Membership Job] ${today.toISOString().slice(0, 10)}`
  );

  console.log(
    `Expired: ${expired.modifiedCount}, Activated: ${activated.modifiedCount}`
  );

  return {
    expired: expired.modifiedCount,
    activated: activated.modifiedCount,
  };
};

let expiryTask;

export const startMembershipExpiryJob = async () => {
  // Recover any missed status changes after downtime
  await reconcileMembershipStatuses();

  expiryTask = cron.schedule(
    "5 0 * * *",
    async () => {
      try {
        await reconcileMembershipStatuses();
      } catch (error) {
        console.error(
          "[Membership Job] Failed:",
          error
        );
      }
    },
    {
      timezone: TIMEZONE,
    }
  );

  console.log("Membership expiry scheduler started");
};