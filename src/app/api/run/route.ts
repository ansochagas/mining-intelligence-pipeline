import { NextResponse } from "next/server";

import { runPipelineFromInput } from "@/lib/pipeline/run";
import { runInputSchema } from "@/lib/pipeline/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = runInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const summary = await runPipelineFromInput(parsed.data.input);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("Pipeline run failed", error);
    return NextResponse.json(
      {
        error: "Pipeline execution failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
