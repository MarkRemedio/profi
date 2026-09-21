import { AuditLogsView, type AuditLogEntry } from "@/components/reports/audit-logs-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { prisma } from "@/lib/prisma"; // Adjust if your prisma client is exported differently

// Queries the DB per request; opt out of static prerender at build time.
export const dynamic = "force-dynamic";

export default async function AuditTrailPage() {

  // Tenant isolation: only ever read this caller's org. RLS is bypassed, so the
  // organizationId filter is the sole boundary between tenants.
  const workspace = await requireAccountingWorkspace();

  // 1. Fetch the raw audit logs from your database
  const rawLogs = await prisma.auditEvent.findMany({
    where: { organizationId: workspace.organizationId },
    orderBy: {
      createdAt: 'desc', // Newest logs first
    }
  });

  // 2. Fetch the REAL Users so we don't just show ugly UUIDs!
  // First, extract all the unique user IDs from the logs
  const userIds = [...new Set(rawLogs.map(log => log.actorUserId).filter(Boolean))] as string[];
  
  // Then, fetch those specific users from the auth table
  const users = await prisma.users.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, raw_user_meta_data: true }
  });

  // Build a quick dictionary to match IDs to Real Names
  const userMap = new Map(
    users.map(u => {
      const meta = u.raw_user_meta_data as any;
      // Try to get their full name from metadata, fallback to the first part of their email
      const name = meta?.full_name || meta?.name || u.email?.split('@')[0] || "Unknown User";
      return [u.id, { name, email: u.email }];
    })
  );

  // 3. Format the database records to match the strict UI types
  const formattedLogs: AuditLogEntry[] = rawLogs.map((log: any) => {
    
    // Format the date to "24/06/2026 15:14:02"
    const formattedDate = new Date(log.createdAt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).replace(",", "");

    // Create a human-readable description
    let desc = `Performed ${log.action} on ${log.entityType}`;
    if (log.after && typeof log.after === 'object') {
       const payload = log.after as any;
       if (payload.name || payload.contactName || payload.invoiceNo) {
         desc += ` (${payload.name || payload.contactName || payload.invoiceNo})`;
       }
    }

    // Match the log's actorUserId to our fetched users dictionary
    const matchedUser = log.actorUserId ? userMap.get(log.actorUserId) : null;

    return {
      id: log.id,
      timestamp: formattedDate,
      
      // ✅ FIX: Show their email instead of the massive ugly UUID string!
      userId: matchedUser?.email || (log.actorUserId ? log.actorUserId.split("-")[0] : "System"),
      
      // ✅ FIX: Show their actual name instead of "System User"
      userName: matchedUser?.name || "System User", 
      
      action: (log.action.toUpperCase() === "REVERSE" || log.action.toUpperCase() === "DELETE") ? "DELETE" 
            : log.action.toUpperCase() as "CREATE" | "UPDATE" | "DELETE" | "POST" | "VOID",
            
      module: log.entityType.toUpperCase() as "INVOICE" | "BILL" | "CONTACT" | "LEDGER" | "SETTINGS" || "SETTINGS",
      documentRef: log.entityId.slice(0, 8).toUpperCase(),
      description: desc,
      ipAddress: "Tracked in Auth",
    };
  });

  // ✅ FIX: Removed "max-w-7xl" and "mx-auto" so it stretches to FULL WIDTH!
  return (
    <div className="w-full pb-8">
      <AuditLogsView initialLogs={formattedLogs} />
    </div>
  );
}