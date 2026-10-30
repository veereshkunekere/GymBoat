import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let mongoServer;

export const startTestDatabase = async () => {
  mongoServer = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
    },
  });

  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri, {
    dbName: "sweatboat_test",
  });

  console.log("[TEST DB] Connected to in-memory replica set");
};

export const clearTestDatabase = async () => {
  const collections = mongoose.connection.collections;

  await Promise.all(
    Object.values(collections).map((collection) =>
      collection.deleteMany({})
    )
  );
};

export const stopTestDatabase = async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  console.log("[TEST DB] Disconnected");
};