/**
 * Takes a backup and proves it restores — NFR-009.
 *
 * The register recorded this as `Not met` with the note "snapshots are assumed, no
 * restore has ever been tested", which is the honest description of most backup
 * arrangements. A dump nobody has restored is not a backup; it is a file.
 *
 * What this does:
 *   1. counts rows in every public table of the live database
 *   2. pg_dump to a file
 *   3. creates a scratch database, restores the dump into it
 *   4. counts rows again and compares table by table
 *   5. drops the scratch database
 *
 * It never writes to the source database, and the scratch database is dropped on
 * every exit path including failure. Run with:
 *
 *   npm run db:verify-backup
 *
 * Requires psql/pg_dump — either on PATH, or inside a running Postgres container
 * (auto-detected, which is the usual local setup here).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    }
  }
}
loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const source = {
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: url.port || "5432",
  database: url.pathname.replace(/^\//, ""),
};
const scratch = `${source.database}_restorecheck`;

/**
 * Prefers a local pg_dump; falls back to exec'ing inside a running Postgres
 * container. Without the fallback this script would simply not run on the machine
 * it most needs to run on.
 */
function detectRunner() {
  if (spawnSync("pg_dump", ["--version"], { stdio: "ignore" }).status === 0) {
    return { kind: "local" };
  }
  const ps = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  if (ps.status === 0) {
    const container = ps.stdout
      .split(/\r?\n/)
      .find((n) => /postgres/i.test(n) && n.trim().length > 0);
    if (container) return { kind: "docker", container: container.trim() };
  }
  return null;
}

const runner = detectRunner();
if (!runner) {
  console.error(
    "Neither pg_dump on PATH nor a running Postgres container was found.\n" +
      "Start the database (docker compose up -d postgres) or install the client tools."
  );
  process.exit(1);
}

/** Runs a postgres CLI tool against `database`, returning stdout. */
function pg(tool, args, database, { input } = {}) {
  const env = { ...process.env, PGPASSWORD: source.password };
  const common = ["-U", source.user, "-d", database];
  if (runner.kind === "local") {
    return execFileSync(tool, ["-h", source.host, "-p", source.port, ...common, ...args], {
      env,
      encoding: "utf8",
      input,
      maxBuffer: 512 * 1024 * 1024,
    });
  }
  // Inside the container the server is local, so host/port are the defaults.
  return execFileSync(
    "docker",
    ["exec", "-i", "-e", `PGPASSWORD=${source.password}`, runner.container, tool, ...common, ...args],
    { encoding: "utf8", input, maxBuffer: 512 * 1024 * 1024 }
  );
}

const COUNT_SQL = `
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY relname;`;

/** Exact counts, not the planner's estimate — an approximation proves nothing. */
function exactCounts(database) {
  const tables = pg("psql", ["-At", "-F", "\t", "-c", COUNT_SQL], database)
    .split(/\r?\n/)
    .map((l) => l.split("\t")[0])
    .filter(Boolean);
  if (tables.length === 0) return {};
  const union = tables
    .map((t) => `SELECT '${t}' AS t, count(*) AS c FROM "${t}"`)
    .join(" UNION ALL ");
  const rows = pg("psql", ["-At", "-F", "\t", "-c", `${union} ORDER BY t`], database)
    .split(/\r?\n/)
    .filter(Boolean);
  return Object.fromEntries(rows.map((r) => { const [t, c] = r.split("\t"); return [t, Number(c)]; }));
}

const tmpDir = path.join(repoRoot, ".backup-verify");
const dumpPath = path.join(tmpDir, "dump.sql");

function dropScratch() {
  try {
    pg("psql", ["-c", `DROP DATABASE IF EXISTS "${scratch}"`], "postgres");
  } catch {
    // Best effort: leaving a scratch database behind is untidy, not dangerous,
    // and must never mask the real failure being reported.
  }
}

let exitCode = 0;
try {
  console.log(`source: ${source.database} on ${source.host}:${source.port} (${runner.kind})`);

  const before = exactCounts(source.database);
  const tableCount = Object.keys(before).length;
  const rowTotal = Object.values(before).reduce((a, b) => a + b, 0);
  console.log(`counted ${rowTotal} rows across ${tableCount} tables`);
  if (tableCount === 0) throw new Error("source database has no tables — nothing to verify");

  mkdirSync(tmpDir, { recursive: true });
  console.log("dumping…");
  const dump = pg("pg_dump", ["--no-owner", "--no-privileges"], source.database);
  // Write via Node rather than a shell redirect so this works identically on
  // Windows and POSIX.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dumpPath, dump, "utf8");
  console.log(`dump written: ${(dump.length / 1024).toFixed(0)} KiB`);

  dropScratch();
  pg("psql", ["-c", `CREATE DATABASE "${scratch}"`], "postgres");
  console.log(`restoring into ${scratch}…`);
  pg("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], scratch, { input: dump });

  const after = exactCounts(scratch);

  const mismatches = [];
  for (const [table, count] of Object.entries(before)) {
    if (after[table] !== count) {
      mismatches.push(`${table}: source ${count}, restored ${after[table] ?? "MISSING"}`);
    }
  }
  const extra = Object.keys(after).filter((t) => !(t in before));
  for (const t of extra) mismatches.push(`${t}: present in restore, absent from source`);

  if (mismatches.length > 0) {
    console.error("\nRESTORE VERIFICATION FAILED");
    for (const m of mismatches) console.error(`  - ${m}`);
    exitCode = 1;
  } else {
    console.log(
      `\nRESTORE VERIFIED — ${tableCount} tables, ${rowTotal} rows, counts identical after restore.`
    );
  }
} catch (err) {
  console.error("\nRESTORE VERIFICATION FAILED");
  console.error(err instanceof Error ? err.message : err);
  exitCode = 1;
} finally {
  dropScratch();
  rmSync(tmpDir, { recursive: true, force: true });
}

process.exit(exitCode);
