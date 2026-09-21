export const queryKeys = {
  workspaceMembership: ["workspace", "membership"] as const,
  /** Currency lock, VAT registration and tax profile, for the settings dialog. */
  workspaceSettings: ["workspace", "settings"] as const,
  notifications: ["notifications"] as const,
  notificationPreferences: ["notification-preferences"] as const,
  purchaseBills: (orgId: string | null) =>
    ["purchases", "bills", orgId] as const,
  purchaseOrdersWorkspace: ["purchases", "orders", "workspace"] as const,
  invoiceWorkspace: ["sales", "invoices", "workspace"] as const,
  billWorkspace: ["purchases", "bills", "workspace"] as const,
  salesReceiptWorkspace: ["sales", "receipts", "workspace"] as const,
  refundReceiptWorkspace: ["sales", "refund-receipts", "workspace"] as const,
};
