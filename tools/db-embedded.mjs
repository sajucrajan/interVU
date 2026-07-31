/* eslint-disable no-console */
// No-Docker local database: runs a real PostgreSQL server from npm-downloaded
// binaries (embedded-postgres). Data persists in .pgdata/ (gitignored).
//
//   pnpm db:embedded          # start (initializes on first run), Ctrl+C stops
//   PGPORT=5433 pnpm db:embedded
//
// Matches the docker-compose defaults, so the standard DATABASE_URL works:
//   postgresql://intervu:intervu@localhost:5432/intervu

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".pgdata");
const port = Number(process.env.PGPORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "intervu",
  password: "intervu",
  port,
  persistent: true,
});

const freshInit = !existsSync(join(dataDir, "PG_VERSION"));
if (freshInit) {
  console.log(`Initializing new Postgres cluster in ${dataDir} …`);
  await pg.initialise();
}
await pg.start();
if (freshInit) {
  await pg.createDatabase("intervu");
}

console.log(`
Embedded Postgres ready.
  DATABASE_URL=postgresql://intervu:intervu@localhost:${port}/intervu
Next (in another terminal, first run only):
  pnpm --filter @intervu/api db:migrate
  pnpm --filter @intervu/api db:seed
Ctrl+C stops the server; data persists in .pgdata/`);

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    console.log("\nStopping embedded Postgres…");
    await pg.stop();
    process.exit(0);
  });
}
setInterval(() => {}, 60_000);
