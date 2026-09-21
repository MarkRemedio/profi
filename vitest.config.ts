import { defineConfig } from "vitest/config";
import path from "node:path";
import { readdirSync, existsSync } from "node:fs";

// Resolve the actual on-disk location of `.prisma/client/default.js` (the
// generated Prisma client). With pnpm, @prisma/client's runtime does
// `require('.prisma/client/default')` and finds it via the .pnpm-hoisted
// node_modules — but Vitest's resolver loses that context, so we alias the
// deep import straight at the resolved file.
function resolvePrismaClientDefault(): string {
  const pnpmDir = path.resolve(__dirname, "node_modules/.pnpm");
  if (existsSync(pnpmDir)) {
    const folders = readdirSync(pnpmDir).filter((name) =>
      /^@prisma\+client@/.test(name)
    );
    for (const folder of folders) {
      const candidate = path.join(
        pnpmDir,
        folder,
        "node_modules/.prisma/client/default.js"
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  // Fallback for non-pnpm installs
  const fallback = path.resolve(
    __dirname,
    "node_modules/.prisma/client/default.js"
  );
  if (existsSync(fallback)) return fallback;
  throw new Error("Could not locate generated Prisma client (.prisma/client/default.js).");
}

const prismaClientDefault = resolvePrismaClientDefault();

export default defineConfig({
  test: {
    pool: "forks",
    fileParallelism: false,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        external: [/@prisma\/client/, /@prisma\/adapter-pg/, /\.prisma/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      ".prisma/client/default": prismaClientDefault,
      // `server-only` is a Next.js marker that throws when imported outside a
      // server bundle. Vitest runs server-side anyway, so shim it to a no-op.
      "server-only": path.resolve(__dirname, "tests/shims/server-only.ts"),
    },
  },
});
