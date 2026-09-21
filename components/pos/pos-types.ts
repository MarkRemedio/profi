export type Product = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  price: number;
  costPrice?: number;
  stockQuantity: number;
  minStockLevel?: number;
  category?: string;
  imageUrl?: string;
  unit?: string;
  taxRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  discount: number;
};

export type Cart = {
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
};

export type PaymentMethod = "cash" | "card" | "mobile" | "split";

export type Sale = {
  id: string;
  receiptNo: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  change?: number;
  status: "completed" | "refunded" | "pending";
  cashierId: string;
  cashierName: string;
  createdAt: string;
  customerId?: string;
  customerName?: string;
  notes?: string;
};

export type InventoryTransaction = {
  id: string;
  productId: string;
  type: "sale" | "purchase" | "adjustment" | "return";
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
};

export type Category = {
  id: string;
  name: string;
  color?: string;
  productCount?: number;
};
