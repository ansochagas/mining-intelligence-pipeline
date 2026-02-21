import { NextResponse } from "next/server";

import { checkDatabaseConnection } from "@/lib/db";

export async function GET() {
  try {
    await checkDatabaseConnection();
    return NextResponse.json(
      {
        status: "ok",
        database: "reachable",
        checkedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Database health check failed", error);
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        message: "Database connection check failed.",
      },
      { status: 503 },
    );
  }
}
