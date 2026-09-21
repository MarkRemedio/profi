export type InvoiceBatchCreateResult = {
  rowId: string;
  invoiceId?: string;
  status: "created" | "failed";
  reason?: string;
};
