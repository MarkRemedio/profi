export type PosRole = "owner" | "accountant" | "employee";

export type PosActor = {
  organizationId: string;
  userId: string;
  role: PosRole;
  actorLabel: string; // human-readable, for pos_stock_logs.created_by
};

export type SaleLineInput = { productId: string; quantity: number };

export type ProcessSaleInput = {
  receiptNo: string;
  /**
   * Free text typed at the till. Still accepted on its own — plenty of counter
   * trade has a name and no record behind it.
   */
  customerName?: string;
  /**
   * A real customer picked at the till. When set, the sale is attributed to
   * that contact, which is what makes the POS customer directory possible:
   * grouping on the name string alone could never reach their email or phone.
   */
  contactId?: string;
  paymentMethod: string; // cash | card | mobile | split
  discountPercent: number; // 0..100
  cashReceived?: number; // minor units; required when paymentMethod === "cash"
  lines: SaleLineInput[];
};

export type ProcessSaleResult = {
  id: string;
  saleNumber: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  changeMinor: number;
  soldAt: string; // ISO
};

export type UpsertProductInput = {
  id?: string;
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  description?: string;
  price: string | number; // major units (pounds)
  costPrice: string | number; // major units
  stockQuantity: string | number;
  minStockLevel?: string | number;
  taxRate?: string | number; // percent
  isActive?: boolean;
  imageUrl?: string;
};

export class PosValidationError extends Error {
  code = "VALIDATION" as const;
}
export class PosNotFoundError extends Error {
  code = "NOT_FOUND" as const;
}
export class PosForbiddenError extends Error {
  code = "FORBIDDEN" as const;
}
export type StockShortage = { sku: string; requested: number; available: number };
export class PosStockError extends Error {
  code = "INSUFFICIENT_STOCK" as const;
  shortages: StockShortage[];
  constructor(shortages: StockShortage[]) {
    super("Insufficient stock for one or more items.");
    this.shortages = shortages;
  }
}
