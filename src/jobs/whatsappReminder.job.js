import cron from "node-cron";
import { runExpiryReminders } from "../modules/whatsapp/whatsapp.service.js";

export const startWhatsAppReminderJob = () => {
  // Daily at 09:00 Asia/Kolkata. Sends only to members with explicit opt-in.
  return cron.schedule("0 9 * * *", async () => {
    try {
      const result = await runExpiryReminders();
      console.log("[WhatsApp reminder job]", result);
    } catch (error) {
      console.error("[WhatsApp reminder job] Failed:", error);
    }
  }, { timezone: "Asia/Kolkata" });
};
