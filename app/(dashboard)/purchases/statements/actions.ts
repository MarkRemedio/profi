"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";

export async function getSupplierBillsAction(contactId: string) {
  try {
    const workspace = await requireAccountantRole();

    // Query your real bills database table for this supplier
    const bills = await prisma.bill.findMany({
      where: {
        contactId: contactId,
        organizationId: workspace.organizationId,
      },
      orderBy: {
        issueDate: "desc",
      },
    });

    return bills.map((bill: any) => {
      // Safely parse the document date
      const documentDate = bill.issueDate || bill.date || bill.createdAt;
      const paymentDueDate = bill.dueDate || documentDate;

      return {
        id: bill.id,
        ref: bill.billNumber || bill.reference || bill.billNo || "N/A",
        date: documentDate ? new Date(documentDate).toISOString() : new Date().toISOString(),
        dueDate: paymentDueDate ? new Date(paymentDueDate).toISOString() : new Date().toISOString(),
        status: bill.status || "PENDING",
        amountMinor: Number(bill.totalAmountMinor || bill.amountMinor || bill.amount || 0),
      };
    });
  } catch (error) {
    console.error("Error fetching supplier statement records:", error);
    return [];
  }
}