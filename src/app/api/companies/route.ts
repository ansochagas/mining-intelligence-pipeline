import { NextResponse } from "next/server";

import { listCompanies } from "@/lib/data-access";

export async function GET() {
  try {
    const companies = await listCompanies();
    return NextResponse.json({ companies }, { status: 200 });
  } catch (error) {
    console.error("Companies list failed", error);
    return NextResponse.json(
      {
        error: "Could not fetch companies",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
