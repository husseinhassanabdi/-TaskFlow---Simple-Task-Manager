import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    const database = mongoose.connection.db;

    if (!database) {
      throw new Error("MongoDB connected without an active database.");
    }

    await database.admin().ping();
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.startsWith("MONGODB_URI is required")
        ? error.message
        : "Database connection failed. Check the server configuration and logs.";

    console.error(
      "Database health check failed.",
      error instanceof Error ? error.name : "Unknown error",
    );

    return NextResponse.json(
      { status: "error", message },
      { status: 503 },
    );
  }
}
