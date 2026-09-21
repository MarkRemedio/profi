import { PrismaClient } from "../prisma-payroll/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.PAYROLL_DATABASE_URL || "";

const adapter = new PrismaPg({ connectionString });

const globalForPayroll = globalThis as unknown as {
  payrollDb: PrismaClient | undefined;
};

export const payrollDb =
  globalForPayroll.payrollDb ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPayroll.payrollDb = payrollDb;
}