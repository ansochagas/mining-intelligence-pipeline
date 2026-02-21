import { NextResponse } from "next/server";
import { z } from "zod";

import { getCompanyDetails } from "@/lib/data-access";

const routeParamsSchema = z.object({
  id: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const parsed = routeParamsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid company id",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const details = await getCompanyDetails(parsed.data.id);
    if (!details) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(details, { status: 200 });
  } catch (error) {
    console.error("Company details request failed", error);
    return NextResponse.json(
      {
        error: "Could not fetch company details",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
