import mongoose from "mongoose";
import type { Logger } from "pino";

/**
 * Establishes MongoDB connection via Mongoose.
 * @param mongoUri - MongoDB connection string
 * @param log - Pino logger instance
 */
export async function connectDatabase(
  mongoUri: string,
  log: Logger,
): Promise<void> {
  mongoose.set("strictQuery", true);

  const conn = await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });

  log.info(
    { host: conn.connection.host, name: conn.connection.name },
    "MongoDB connected",
  );
}

/**
 * Closes Mongoose connection gracefully.
 */
export async function disconnectDatabase(log: Logger): Promise<void> {
  await mongoose.connection.close();
  log.info("MongoDB connection closed");
}
