import { defineConfig } from "prisma/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Prisma CLI config for the SECOND database (payroll).
 *
 * Separate from prisma.config.ts because the CLI takes one schema per
 * invocation. Mirrors that file's manual env loading: this project keeps its
 * secrets in .env.local, which the Prisma CLI does not read on its own.
 *
 * Usage:
 *   npx prisma db pull   --config prisma-payroll.config.ts
 *   npx prisma generate  --config prisma-payroll.config.ts
 */
for (const fileName of [".env", ".env.local"]) {
  const filePath = join(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    continue;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  schema: "prisma-payroll/schema.prisma",
  datasource: {
    // Direct connection (5432), not the pooler — introspection needs it.
    url: process.env["PAYROLL_DIRECT_URL"] ?? process.env["PAYROLL_DATABASE_URL"],
  },
});
