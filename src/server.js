import app from "./app.js";
import connectDB from "./config/database.js";
import { env } from "./config/env.js";
import { startMembershipExpiryJob} from "./jobs/membershipExpiry.job.js";
import { startWhatsAppReminderJob } from "./jobs/whatsappReminder.job.js";
const startServer = async () => {
  try {
    // Connect database first
    await connectDB();

    await startMembershipExpiryJob();
    const whatsappTask = startWhatsAppReminderJob();

    // Start Express
    const server = app.listen(env.PORT, () => {
      console.log(
        `Server running on port ${env.PORT}`
      );

      console.log(
        `Environment: ${env.NODE_ENV}`
      );

      console.log(
        `API: http://localhost:${env.PORT}/api/v1`
      );
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down...`);

      whatsappTask.stop();
      server.close(async () => {
        const mongoose = await import("mongoose");
        await mongoose.default.connection.close();

        console.log("Server and database connection closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();