import { RevenueDashboard } from "@/components/sales/revenue-dashboard";
import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";

// Queries the DB per request; opt out of static prerender at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Revenue Dashboard | Waw Profi",
  description: "Overview of your sales performance and receivables.",
};

function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export default async function SalesPage() {
  // 🛡️ Instantly locks this view down to the actual logged-in user
  const workspace = await requireAccountingWorkspace();

  // 1. Fetch ONLY invoices using the proper service layer helper to resolve discounts and payments
  const allInvoices = (await listInvoices(prisma, workspace.organizationId)) as InvoiceWithLines[];

  // --- KPI LOGIC ---
  let totalRevenue = 0;
  let outstanding = 0;
  let overdue = 0;
  let collected = 0; 
  const now = new Date();

  // Base currency throughout: every tile, the chart and the customer ranking
  // add invoices together and print the result with the workspace symbol, so a
  // peso invoice and a pound invoice must be converted before they meet.
  // Older rows predate the base columns and fall back to the face value, which
  // is identical for the single-currency workspaces that created them.
  const baseTotal = (inv: InvoiceWithLines) => (inv.baseTotalMinor || inv.totalMinor || 0) / 100;
  const basePaid = (inv: InvoiceWithLines) =>
    (inv.baseAmountPaidMinor ?? inv.amountPaidMinor ?? 0) / 100;

  allInvoices.forEach((inv) => {
    const amount = baseTotal(inv);
    const paid = basePaid(inv);
    const remaining = amount - paid;
    const isPaid = paid >= amount;
    const status = inv.status; // lowercase from listInvoices

    if (status === "approved" || status === "sent") {
      totalRevenue += amount;

      // Collected = money actually received this month. Sum each posted
      // payment by its own paid date so partial payments count — the old
      // code only credited an invoice's FULL total once it was fully settled,
      // so a part-paid invoice showed £0 collected.
      for (const payment of inv.payments) {
        const paidDate = parseDateLocal(payment.paidAt);
        if (paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear()) {
          // Payment journals post in the workspace currency, so this needs no
          // conversion — unlike the document totals above.
          collected += payment.amountMinor / 100;
        }
      }

      // Outstanding / overdue age the UNPAID balance only. A part-paid
      // invoice ages its remaining portion, not its full total (which would
      // double-count the amount already reported as collected).
      if (!isPaid && remaining > 0) {
        const dueDateObj = inv.dueDate ? parseDateLocal(inv.dueDate) : null;
        if (dueDateObj && dueDateObj < now) {
          overdue += remaining;
        } else {
          outstanding += remaining;
        }
      }
    }
  });

  // --- RECENT INVOICES WIDGET ---
  const activeInvoices = allInvoices
    .filter(inv => inv.status !== "draft" && inv.status !== "void")
    .slice(0, 4)
    .map((inv) => ({
      id: inv.invoiceNo,
      client: inv.contactName,
      amount: baseTotal(inv),
      status: basePaid(inv) >= baseTotal(inv) ? "PAID" : inv.status.toUpperCase(),
      date: parseDateLocal(inv.issueDate).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }),
    }));

  // --- QUOTES WIDGET (Using DRAFT invoices as a placeholder!) ---
  const recentQuotes = allInvoices
    .filter(inv => inv.status === "draft")
    .slice(0, 3)
    .map((inv) => ({
      id: inv.invoiceNo,
      client: inv.contactName,
      amount: baseTotal(inv),
      status: "DRAFT",
      date: parseDateLocal(inv.issueDate).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }),
    }));

  // --- DYNAMIC CHART CALCULATION (Last 6 Months) ---
  const chartData: { month: string; year: number; total: number; monthIndex: number }[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Generate the last 6 months buckets
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    chartData.push({ month: monthNames[d.getMonth()], year: d.getFullYear(), total: 0, monthIndex: d.getMonth() });
  }

  // Drop revenue into the correct monthly bucket
  allInvoices.forEach((inv) => {
    const amount = baseTotal(inv);
    if (inv.status === "approved" || inv.status === "sent") {
      const invDate = parseDateLocal(inv.issueDate);
      const bucket = chartData.find(b => b.monthIndex === invDate.getMonth() && b.year === invDate.getFullYear());
      if (bucket) bucket.total += amount;
    }
  });

  // Find the highest month to scale the bars (minimum 1 to prevent dividing by zero)
  const maxTotal = Math.max(...chartData.map(b => b.total), 1); 

  const chartBars = chartData.map(b => {
    const percentage = Math.min((b.total / maxTotal) * 100, 100);
    return {
      month: b.month,
      rawTotal: b.total,
      heightBg: `${percentage}%`, // The light blue background
      heightFg: `${percentage * 0.75}%`, // The dark blue foreground (75% of total for visual depth)
    };
  });

  // --- EXPECTED SALES PROJECTION CALCULATION (Next 6 Months) ---
  // 1. Calculate past 6-month average monthly revenue
  const averageMonthlyRevenue = chartData.reduce((sum, b) => sum + b.total, 0) / 6;

  // 2. Generate the next 6 months buckets
  const projectionData: { month: string; year: number; collected: number; guaranteed: number; projected: number; monthIndex: number }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    projectionData.push({
      month: monthNames[d.getMonth()],
      year: d.getFullYear(),
      collected: 0,
      guaranteed: 0,
      projected: 0,
      monthIndex: d.getMonth(),
    });
  }

  // 3. Drop due dates of approved/sent invoices into the correct future monthly buckets (separating paid vs unpaid)
  allInvoices.forEach((inv) => {
    const amount = inv.totalMinor / 100;
    const paid = inv.amountPaidMinor / 100;
    const remaining = Math.max(0, amount - paid);
    if ((inv.status === "approved" || inv.status === "sent") && inv.dueDate) {
      const dueDate = parseDateLocal(inv.dueDate);
      const bucket = projectionData.find(b => b.monthIndex === dueDate.getMonth() && b.year === dueDate.getFullYear());
      if (bucket) {
        // Split the invoice by what's actually banked vs. still owed, so a
        // part-paid invoice shows its paid slice as collected and the rest as
        // guaranteed — instead of the whole total landing in one bucket based
        // on a binary paid/unpaid flag.
        bucket.collected += paid;
        bucket.guaranteed += remaining;
      }
    }
  });

  // 4. Calculate projected trend values with a progressive growth factor (+5% per month)
  projectionData.forEach((b, index) => {
    const monthStep = index + 1; // Month 1 to 6
    const growthMultiplier = 1 + (monthStep * 0.05); // +5% for Month 1, +10% for Month 2, etc.
    const targetRevenue = averageMonthlyRevenue * growthMultiplier;
    b.projected = Math.max(0, targetRevenue - (b.collected + b.guaranteed));
  });

  // 5. Find the highest combined expected total to scale the projection bars
  const maxProjectionTotal = Math.max(...projectionData.map(b => b.collected + b.guaranteed + b.projected), 1);

  // 6. Map to projection bars payload
  const projectionBars = projectionData.map(b => {
    const total = b.collected + b.guaranteed + b.projected;
    const totalPercentage = Math.min((total / maxProjectionTotal) * 100, 100);

    return {
      month: b.month,
      rawTotal: total,
      rawCollected: b.collected,
      rawGuaranteed: b.guaranteed,
      rawProjected: b.projected,
      heightTotal: `${totalPercentage}%`,
    };
  });

  // --- TOP CUSTOMERS WIDGET ---
  // Ranked by what they have actually been billed. This previously took the
  // first three customer rows in no particular order and reported a hardcoded
  // total of 0, so the widget showed real names against £0.00 and was not
  // ranked by anything at all.
  const billedByContact = new Map<string, number>();
  for (const inv of allInvoices) {
    if (inv.status === "draft" || inv.status === "void") continue;
    billedByContact.set(inv.contactId, (billedByContact.get(inv.contactId) ?? 0) + baseTotal(inv));
  }

  const rankedContactIds = [...billedByContact.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([contactId]) => contactId);

  const topContacts = rankedContactIds.length
    ? await prisma.contact.findMany({
        where: { organizationId: workspace.organizationId, id: { in: rankedContactIds } },
        select: { id: true, name: true, email: true, isActive: true },
      })
    : [];

  const topCustomers = rankedContactIds
    .map((contactId) => {
      const contact = topContacts.find((candidate) => candidate.id === contactId);
      if (!contact) return null;
      return {
        name: contact.name,
        email: contact.email || "No email provided",
        total: billedByContact.get(contactId) ?? 0,
        active: contact.isActive,
      };
    })
    // Re-sorted by the ranking rather than the database's return order.
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <RevenueDashboard 
      kpiData={{ totalRevenue, outstanding, overdue, collected }}
      recentInvoices={activeInvoices}
      topCustomers={topCustomers}
      recentQuotes={recentQuotes}
      chartBars={chartBars}
      projectionBars={projectionBars}
      averageMonthlyRevenue={averageMonthlyRevenue}
    />
  );
}