import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const targetPath = path.join(repoRoot, "src", "integrations", "supabase", "types.ts");
const checkOnly = process.argv.includes("--check");

const sensitiveValues = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      value && value.length >= 8 && /TOKEN|SECRET|PASSWORD|DATABASE_URL|KEY/i.test(key),
  )
  .map(([, value]) => value);

function redact(text = "") {
  let safe = text;
  for (const value of sensitiveValues) {
    safe = safe.split(value).join("[redacted]");
  }
  return safe;
}

function fail(message, detail = "") {
  console.error(message);
  if (detail) console.error(redact(detail));
  process.exit(1);
}

const result = spawnSync(
  "supabase",
  ["gen", "types", "typescript", "--linked", "--schema", "public"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (result.error) {
  fail(
    "Failed to run Supabase CLI. Install the CLI and authenticate with `supabase login`, or set SUPABASE_ACCESS_TOKEN in the environment.",
    result.error.message,
  );
}

if (result.status !== 0) {
  fail(
    "Supabase type generation failed. Confirm the project is linked and the CLI session can access the live project.",
    `${result.stderr}\n${result.stdout}`,
  );
}

const generated = result.stdout.replace(/\r\n/g, "\n").trimEnd() + "\n";
if (!generated.includes("export type Database =")) {
  fail(
    "Supabase CLI returned unexpected output; refusing to write types.",
    generated.slice(0, 500),
  );
}

if (checkOnly) {
  const current = existsSync(targetPath)
    ? readFileSync(targetPath, "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n"
    : "";
  if (current !== generated) {
    fail("Supabase types are out of date. Run `pnpm supabase:types` and review the diff.");
  }
  console.log("Supabase types are current.");
} else {
  writeFileSync(targetPath, generated, "utf8");
  console.log(`Generated Supabase types: ${path.relative(repoRoot, targetPath)}`);
}
