import { JournalWorkspace } from "@/components/accounting/journal-workspace";
import {
  getAccountOptions,
  getJournalList,
  requireAccountingWorkspace,
} from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(Array.isArray(pageParam) ? pageParam[0] : (pageParam ?? "1"), 10) || 1);

  const workspace = await requireAccountingWorkspace();
  const [accounts, journalPage, organization] = await Promise.all([
    getAccountOptions(workspace.organizationId),
    // Twenty a page. Fifty made the register a scroll rather than a list,
    // and the entry form above it is the reason most people open this page.
    getJournalList(workspace.organizationId, { page, pageSize: 20 }),
    prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { dateFormat: true },
    }),
  ]);

  return (
    <JournalWorkspace
      accounts={accounts}
      journals={journalPage.items}
      pagination={{ page: journalPage.page, pageSize: journalPage.pageSize, total: journalPage.total }}
      canManage={workspace.role === "owner" || workspace.role === "accountant"}
      dateFormat={organization?.dateFormat ?? "YYYY-MM-DD"}
    />
  );
}
