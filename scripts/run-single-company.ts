import fs from "fs";
import path from "path";

import { runPipelineFromInput } from "../src/lib/pipeline/run";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const projectRoot = process.cwd();
  loadEnvFile(path.join(projectRoot, ".env.local"));

  const companyName = process.argv[2] ?? "BHP";
  const startedAt = new Date().toISOString();

  console.log(`[run-single-company] starting: company="${companyName}" at ${startedAt}`);
  const summary = await runPipelineFromInput(companyName);
  const finishedAt = new Date().toISOString();

  console.log(`[run-single-company] finished at ${finishedAt}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[run-single-company] failed: ${message}`);
  process.exit(1);
});
