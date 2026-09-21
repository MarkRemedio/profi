import "server-only";

import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tenancyExtension } from "@/lib/tenancy/extension";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL is required for Prisma.");
  }

  return connectionString;
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: getConnectionString() }),
  }).$extends(tenancyExtension);
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** The type of the tenancy-extended Prisma client. Use this instead of PrismaClient. */
export type ExtendedPrismaClient = typeof prisma;

/**
 * The transaction-client type produced by the extended client's $transaction.
 * Use this instead of Prisma.TransactionClient when the outer client is extended.
 */
export type TransactionClient = Parameters<
  Parameters<ExtendedPrismaClient["$transaction"]>[0]
>[0];

/**
 * Accepts either the extended root client or a transaction client from it.
 * Use this for function parameters that need to work in both contexts.
 */
export type DbOrTx = ExtendedPrismaClient | TransactionClient;
