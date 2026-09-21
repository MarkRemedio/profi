import { DashboardOverview } from "@/components/accounting/dashboard-overview";
import { getDashboardOverview } from "@/lib/accounting/dashboard";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma";
import { listBankAccounts } from "@/lib/banking/dal";
import { createClient } from "@/lib/supabase/server"; // 🚀 Added
import { runAsSystem } from "@/lib/tenancy/context"; // 🚀 Added

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await requireAccountingWorkspace();

  // 🚀 Fetch the active authenticated user session from Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 'data' now contains EVERYTHING! Bank accounts come straight from the banking DAL.
  const [data, bankAccounts, roleRecord] = await Promise.all([
    getDashboardOverview(workspace.organizationId),
    listBankAccounts(prisma, workspace.organizationId),
    user ? runAsSystem(async () => {
      return await prisma.userRole.findFirst({
        where: { userId: user.id, organizationId: workspace.organizationId },
        select: { role: true }
      });
    }) : null
  ]);

  const currentRole = roleRecord?.role || "EMPLOYEE";

  return (
    <DashboardOverview 
      overview={data} 
      role={currentRole} // 🚀 Transmits active role down to filter charts & widgets 
      
      // ✅ 1. THE RING CHARTS AND LISTS
      expenseCategories={data.expenseCategories || []}
      assetDistribution={data.assetDistribution || []}
      liabilityDistribution={data.liabilityDistribution || []}
      topAccounts={data.topAccounts || []}
      invoiceStatus={data.invoiceStatus || []}
      billStatus={data.billStatus || []}

      // ✅ 2. THE TIME-SERIES CHARTS
      monthlyTrends={data.monthlyTrends || []}
      arAging={data.arAging || []}
      apAging={data.apAging || []}
      weeklyCashFlow={data.weeklyCashFlow || []}

      // ✅ 3. THE FINAL FOUR WIDGETS
      vatSummary={data.vatSummary}
      financialRatios={data.financialRatios || []}
      journalActivity={data.journalActivity || []}
      alerts={data.alerts || []}
      spendAnomalies={data.spendAnomalies || []}

      revenueSources={[]}
      bankBalanceTrend={data.bankBalanceTrend || []}
      contactStats={data.contactStats}
      bankAccounts={bankAccounts || []}
    />
  );
}
