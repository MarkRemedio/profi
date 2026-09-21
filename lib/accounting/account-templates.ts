import "server-only";

import type { DbOrTx } from "@/lib/prisma";

type DbClient = DbOrTx;

export async function createStarterAccountsForOrganization(
  db: DbClient,
  organizationId: string
) {
  const templates = await db.accountTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  if (templates.length === 0) {
    throw new Error("No starter account templates exist in the database.");
  }

  await db.chartAccount.createMany({
    data: templates.map((template) => ({
      organizationId,
      code: template.code,
      name: template.name,
      description: template.description,
      accountType: template.accountType,
      reportCategory: template.reportCategory,
      taxCode: template.taxCode,
      taxRate: template.taxRate,
      isSystem: template.isSystem,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}
