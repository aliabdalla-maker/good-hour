/**
 * Runs the integration suite with the environment actually present in the child
 * processes that execute the tests.
 *
 * This exists because of a silent failure worth remembering. The script used to be
 * `node -r dotenv/config --test "**\/*.itest.ts"`, and `node --test` spawns each
 * test FILE in its own child process. A CJS `--require` does not carry across that
 * boundary, so `DATABASE_URL` was undefined in every child. The result was not an
 * error: the run hung with no output at all and had to be killed. Two integration
 * test files had therefore never executed once.
 *
 * Loading `.env` here and passing the resolved environment down means the children
 * inherit it. Missing config now fails immediately with a readable message instead
 * of hanging.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repoRoot, ".env");

const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    // Never override something already set in the shell — CI supplies its own.
    if (env[key] !== undefined) continue;
    env[key] = rawValue.trim().replace(/^["'](.*)["']$/, "$1");
  }
}

if (!env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. The integration suite runs against a real Postgres:\n" +
      "  docker compose up -d postgres\n" +
      "  npm run db:deploy\n" +
      "  npm run test:integration"
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-reporter=spec",
    // Serially: these tests deliberately create write contention, and running
    // files in parallel would have them contend with each other instead, making
    // the assertions about *this* test's contention unreliable.
    "--test-concurrency=1",
    "--test-timeout=40000",
    "packages/**/src/**/*.itest.ts",
  ],
  { cwd: repoRoot, env, stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 1));
