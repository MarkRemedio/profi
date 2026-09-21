import { requireAdminPermission } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { MasterClients } from "@/components/admin/clients"; 
import { getAdminClients } from "./actions"; 
import { fetchPayrollClients } from "./payroll-actions"; // 🚀 Import Payroll Fetcher

export const metadata = {
  title: "Client Directory | Admin Terminal",
};

export default async function AdminClientsPage() {
  await requireAdminPermission("clients");

  // 1. Fetch Waw-Profi clients from main DB
  const realClients = await getAdminClients();

  // 2. Fetch Payroll clients from secondary DB
  const payrollClients = await fetchPayrollClients();

  // 3. Fetch all active plans from database
  const dbPlans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { order: 'asc' }
  });

  // 4. Convert Prisma Decimal object to a plain JavaScript number
  const safePlans = dbPlans.map(plan => ({
    ...plan,
    price: Number(plan.price)
  }));

  // 5. Pass BOTH client datasets into your UI component
  return (
    <MasterClients 
      clients={realClients} 
      payrollClients={payrollClients} 
      plans={safePlans} 
    />
  );
}