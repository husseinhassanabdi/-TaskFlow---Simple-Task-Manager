import "server-only";

import mongoose from "mongoose";

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cached = globalForMongoose.mongooseCache ?? {
  connection: null,
  promise: null,
};

globalForMongoose.mongooseCache = cached;

export default async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.connection) return cached.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is required. Add the MongoDB Atlas connection string to the project root .env file.",
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri).catch((error: unknown) => {
      cached.promise = null;
      throw error;
    });
  }

  cached.connection = await cached.promise;
  return cached.connection;
}
