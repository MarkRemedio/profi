"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencyInputInset } from "@/lib/currency";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ScanBarcode,
  Camera,
  Search,
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  X,
  CheckCircle2,
  Printer,
  RotateCcw,
  Package,
  Tag,
  User,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosProductGridSkeleton } from "@/components/pos/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { BarcodeScannerDialog } from "@/components/pos/barcode-scanner-dialog";
import type { Product, CartItem, PaymentMethod, Sale } from "./pos-types";

// Import our server actions
import {
  getPosCustomers,
  getPosProducts,
  processLiveSale,
  type PosCustomer,
} from "@/app/(dashboard)/pos/actions";

function generateReceiptNo(): string {
  return `RCP-${Date.now().toString(36).toUpperCase()}`;
}


export function POSTerminal() {
  const { symbol, format } = useCurrency();
  const { format: formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showScannerDialog, setShowScannerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  /**
   * The customer this sale is rung up against, when one is picked.
   *
   * A typed name alone cannot be attributed — the directory could never link it
   * back to a record, which is why it used to invent contact details. Picking a
   * real customer here is what puts the sale on their history.
   */
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerOptions, setCustomerOptions] = useState<PosCustomer[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  /** Printed at the top of the receipt. */
  const [businessName, setBusinessName] = useState("");

  // Loaded when the field is first focused, not on mount — a till that never
  // attaches a customer should not pay for the list on every shift.
  const loadCustomerOptions = useCallback(async () => {
    const result = await getPosCustomers();
    if (result.success) setCustomerOptions(result.data);
  }, []);

  const customerMatches = useMemo(() => {
    const term = customerName.trim().toLowerCase();
    const pool = term
      ? customerOptions.filter((customer) => customer.name.toLowerCase().includes(term))
      : customerOptions;
    return pool.slice(0, 6);
  }, [customerOptions, customerName]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Live database products state loops
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const result = await getPosProducts();
    if (result.success && result.data) {
      setProducts(result.data as unknown as Product[]);
    } else {
      toast.error("Failed to load products from database.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Generates precise categories array dynamically from active database products
  const dynamicCategories = useMemo(() => {
    const unique = new Set(
      products.map((p) => p.category?.trim()).filter(Boolean)
    );
    return ["all", ...Array.from(unique)];
  }, [products]);

  // Filters products and calculates pagination blocks
  const { paginatedProducts, totalPages } = useMemo(() => {
    const matched = products.filter((p) => {
      const matchesSearch = searchQuery === "" || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.includes(searchQuery);
        
      const matchesCategory = selectedCategory === "all" || 
        p.category?.toLowerCase() === selectedCategory.toLowerCase();
        
      return matchesSearch && matchesCategory;
    });
    
    const totalPages = Math.ceil(matched.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedProducts = matched.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    return { paginatedProducts, totalPages };
  }, [searchQuery, selectedCategory, products, currentPage]);

  // Reset to page 1 automatically when searching or changing categories
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Cart calculations
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const discountedSubtotal = subtotal - discountAmount;
    const tax = cart.reduce((sum, item) => {
      const itemTotal = item.product.price * item.quantity;
      const itemDiscount = Math.round(itemTotal * (discountPercent / 100));
      return sum + Math.round((itemTotal - itemDiscount) * (item.product.taxRate / 100));
    }, 0);
    const total = discountedSubtotal + tax;
    return { subtotal, discount: discountAmount, tax, total, itemCount: cart.reduce((sum, i) => sum + i.quantity, 0) };
  }, [cart, discountPercent]);

  /**
   * Look a code up and basket it. Shared by the typed/USB-scanner box and the
   * camera dialog so both behave identically.
   */
  const addByCode = useCallback((rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return false;

    const product = products.find(p => p.barcode === code || p.sku === code);
    if (!product) {
      toast.error(`Product not found: ${code}`);
      return false;
    }

    addToCart(product);
    toast.success(`Added: ${product.name}`);
    return true;
  }, [products]);

  // Barcode scan handler
  const handleBarcodeScan = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (addByCode(barcodeInput)) {
      setBarcodeInput("");
    }
  }, [barcodeInput, addByCode]);

  // Add to cart
  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) {
      toast.error("Out of stock");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1, discount: 0 }];
    });
  };

  // Update quantity
  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > item.product.stockQuantity) {
          toast.error("Not enough stock");
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Remove from cart
  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setCustomerName("");
    // Cleared with the name. A linked customer left behind would silently
    // attach the next shopper's sale to the previous one's history.
    setCustomerId(null);
    setCustomerPickerOpen(false);
  };

  // Process payment with live database connection
  const processPayment = async () => {
    setIsProcessing(true);

    const salePayload = {
      receiptNo: generateReceiptNo(),
      subtotal: cartTotals.subtotal,
      tax: cartTotals.tax,
      discount: cartTotals.discount,
      discountPercent: discountPercent,
      total: cartTotals.total,
      paymentMethod,
      cashReceived: paymentMethod === "cash" ? Math.round(parseFloat(cashReceived || "0") * 100) : undefined,
      change: paymentMethod === "cash" ? Math.round(parseFloat(cashReceived || "0") * 100) - cartTotals.total : undefined,
      customerName: customerName || undefined,
      contactId: customerId ?? undefined,
    };

    const result = await processLiveSale(salePayload, cart);

    if (result.success && result.data) {
      setLastSale({
        id: result.data.id,
        receiptNo: salePayload.receiptNo,
        subtotal: salePayload.subtotal,
        tax: salePayload.tax,
        discount: salePayload.discount,
        total: salePayload.total,
        paymentMethod: salePayload.paymentMethod,
        cashReceived: salePayload.cashReceived,
        change: salePayload.change,
        customerName: salePayload.customerName,
        items: [...cart],
        status: "completed",
        cashierId: "current-user",
        cashierName: "Admin User",
        createdAt: new Date(result.data.sold_at).toISOString(),
      } as any);
      
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
      clearCart();
      toast.success("Sale completed successfully!");
      await loadProducts();
    } else {
      toast.error(result.error || "Failed to process sale.");
    }
    
    setIsProcessing(false);
  };

  const changeAmount = paymentMethod === "cash" && cashReceived 
    ? Math.round(parseFloat(cashReceived) * 100) - cartTotals.total 
    : 0;

  const handlePrintReceipt = () => {
    if (!lastSale) {
      toast.error("No transaction found to print.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocker intercepted print window. Please allow popups for this site.");
      return;
    }

    const receiptHtml = `
      <html>
        <head>
          <title>Receipt ${lastSale.receiptNo}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 13px; 
              line-height: 1.4;
              width: 280px; 
              margin: 0 auto; 
              padding: 20px 10px;
              color: #000;
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            .flex-row { display: flex; justify-content: space-between; }
            .items-container { margin: 12px 0; }
            .total-row { font-size: 15px; font-weight: bold; margin-top: 4px; }
            .meta-text { font-size: 11px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="bold" style="font-size: 16px;">${businessName}</div>
            <div class="meta-text">${new Date(lastSale.createdAt).toLocaleString()}</div>
          </div>
          <div class="divider"></div>
          <div class="items-container">
            ${lastSale.items.map((item: any) => `
              <div class="flex-row">
                <span>${item.quantity}x ${item.product.name.substring(0, 18)}</span>
                <span>${formatCurrency(item.product.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
          <div class="divider"></div>
          <div class="space-y-1">
            <div class="flex-row"><span>Subtotal</span><span>${formatCurrency(lastSale.subtotal)}</span></div>
            ${lastSale.discount > 0 ? `<div class="flex-row"><span>Discount</span><span>-${formatCurrency(lastSale.discount)}</span></div>` : ''}
            <div class="flex-row"><span>Tax</span><span>${formatCurrency(lastSale.tax)}</span></div>
            <div class="flex-row total-row"><span>TOTAL</span><span>${formatCurrency(lastSale.total)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="meta-text">
            <div>Receipt No: ${lastSale.receiptNo}</div>
            <div>Payment: ${lastSale.paymentMethod.toUpperCase()}</div>
            ${lastSale.cashReceived ? `<div>Received: ${formatCurrency(lastSale.cashReceived)}</div>` : ''}
            ${lastSale.change !== undefined ? `<div>Change: ${formatCurrency(lastSale.change)}</div>` : ''}
          </div>
          <div class="text-center" style="margin-top: 25px; font-size: 12px;">
            Thank you for your business!
          </div>
          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 150); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  return (
    <>
      {/* 🚀 FIXED: Sneaky global override to forcefully kill the master page scrollbar on desktop view ONLY! */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 1024px) {
          body, html, main { 
            overflow: hidden !important; 
          }
        }
      `}} />

      {/* 🚀 FIXED: Adjusted desktop height to 9rem to lock it inside the dashboard perfectly! */}
      <div className="flex flex-col min-h-[calc(100vh-7rem)] lg:h-[calc(100vh-9rem)] lg:max-h-[calc(100vh-9rem)] w-full overflow-y-auto lg:overflow-hidden pb-6 lg:pb-0">
        {/* Header */}
        <div className="mb-4 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">POS Terminal</h1>
            <p className="text-sm text-slate-500">Process sales, scan barcodes, manage transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 border border-slate-200">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-slate-600">Terminal Online</span>
            </div>
          </div>
        </div>
      {/* 🚀 FIXED: Used flex-col on mobile so they stack, but grid on desktop */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-4 lg:min-h-0">
        {/* Products Section */}
        <div className="lg:col-span-2 flex flex-col gap-4 lg:min-h-0">
          {/* Barcode Scanner */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shrink-0">
            <form onSubmit={handleBarcodeScan} className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Scan barcode or enter SKU..."
                  className="pl-10 h-12 text-lg rounded-xl"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  autoFocus
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" size="lg" className="gap-2 bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl" disabled={isLoading}>
                <ScanBarcode className="h-4 w-4" />
                Scan
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="gap-2 h-12 rounded-xl shrink-0"
                onClick={() => setShowScannerDialog(true)}
                disabled={isLoading}
                title="Scan using this device's camera"
              >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline">Camera</span>
              </Button>
            </form>
          </div>

          {/* Search & Dropdown Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search products by name, SKU..."
                className="pl-9 h-10 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoading}>
              <SelectTrigger className="w-full sm:w-[200px] h-10 rounded-xl bg-white border border-slate-200 text-slate-700 capitalize">
                <Tag className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {dynamicCategories.map(cat => (
                  <SelectItem key={cat} value={cat?.toLowerCase() || ""} className="capitalize cursor-pointer">
                    {cat === "all" ? "All Categories" : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Products Grid */}
          {/* 🚀 FIXED: Only scroll internally on desktop (lg:overflow-y-auto), naturally grows on mobile */}
          <div className="lg:flex-1 lg:overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 min-h-[380px] flex flex-col">
            {isLoading ? (
              <PosProductGridSkeleton count={8} />
            ) : paginatedProducts.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-slate-500 py-12">
                <Package className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm font-medium text-slate-400">No active products match your filter parameters.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 content-start flex-1">
                  {paginatedProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        addToCart(product);
                        const activeCart = document.getElementById("active-pos-cart");
                        if (activeCart) {
                          activeCart.classList.remove("animate-pulse");
                          void activeCart.offsetWidth; 
                          activeCart.classList.add("animate-pulse");
                          setTimeout(() => activeCart.classList.remove("animate-pulse"), 600);
                        }
                      }}
                      disabled={product.stockQuantity <= 0}
                      className={cn(
                        "relative flex flex-col rounded-xl border transition-all duration-300 overflow-hidden text-left",
                        product.stockQuantity <= 0
                          ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-lg active:scale-95"
                      )}
                    >
                      {/* Stock indicator dots */}
                      <div className={cn(
                        "absolute right-2.5 top-2.5 h-3 w-3 rounded-full border-2 border-white shadow-md z-10",
                        product.stockQuantity <= (product.minStockLevel || 0) ? "bg-amber-500" : "bg-green-500"
                      )} />
                      
                      {/* Full Cover Image Frame */}
                      <div className="relative aspect-video w-full border-b border-slate-100 bg-slate-50 overflow-hidden shadow-inner shrink-0">
                        {(product as any).imageUrl || (product as any).image_url ? (
                          <img 
                            src={(product as any).imageUrl || (product as any).image_url} 
                            alt={product.name} 
                            className="h-full w-full object-cover" 
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                      </div>
                      
                      {/* Product Metadata */}
                      <div className="flex flex-col gap-0.5 p-3.5 pt-3">
                        <p className="text-[10px] text-slate-400 font-mono tracking-tight">{product.sku}</p>
                        <p className="font-semibold text-slate-900 line-clamp-1 text-sm mt-0.5 leading-tight">{product.name}</p>
                        <p className="mt-1 text-base font-bold text-indigo-600">{formatCurrency(product.price)}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Stock: {product.stockQuantity} remaining</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Pagination UI Footer */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 shrink-0">
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1}
                      className="rounded-lg h-9 bg-white"
                    >
                      Previous
                    </Button>
                    <span className="text-sm font-medium text-slate-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages}
                      className="rounded-lg h-9 bg-white"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 🚀 FIXED: Added lg:min-h-0 so the cart wrapper doesn't expand past the screen on desktop */}
        <div id="active-pos-cart" className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:h-full lg:min-h-0 transition-all duration-300">
          {/* Cart Header */}
          <div className="border-b border-slate-200 p-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-indigo-600" />
                <h2 className="font-bold text-slate-900">Current Sale</h2>
                {cartTotals.itemCount > 0 && (
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                    {cartTotals.itemCount} items
                  </Badge>
                )}
              </div>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-600 hover:text-red-700 h-8 rounded-lg">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            
            {/* Customer — typed, or picked from the real customer records.
                Only a picked one can be attributed to a purchase history. */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  placeholder="Customer name (optional)"
                  className="h-9 text-sm rounded-xl"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    // Typing over a picked customer detaches the link; keeping
                    // it would file the sale under someone whose name is no
                    // longer on screen.
                    setCustomerId(null);
                  }}
                  onFocus={() => {
                    if (customerOptions.length === 0) void loadCustomerOptions();
                    setCustomerPickerOpen(true);
                  }}
                />
                {customerId && (
                  <Badge className="shrink-0 bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold">
                    Linked
                  </Badge>
                )}
              </div>

              {customerPickerOpen && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm max-h-44 overflow-y-auto">
                  {customerMatches.length === 0 ? (
                    <p className="m-0 px-3 py-3 text-xs text-slate-400">
                      {customerOptions.length === 0
                        ? "Loading your customers…"
                        : "No match — the sale will record the typed name only."}
                    </p>
                  ) : (
                    customerMatches.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setCustomerId(customer.id);
                          setCustomerName(customer.name);
                          setCustomerPickerOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate font-semibold text-slate-700">
                          {customer.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {customer.visits > 0 ? `${customer.visits} purchases` : "New"}
                        </span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setCustomerPickerOpen(false)}
                    className="w-full border-t border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 🚀 FIXED: internal scrollbars trigger properly now with lg:min-h-0 */}
          <div className="flex-1 overflow-y-auto lg:min-h-0 p-4 max-h-[400px] lg:max-h-none">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slate-400 py-12">
                <ShoppingCart className="h-14 w-14 mb-3 opacity-20" />
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs mt-0.5">Scan or click products to add</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{item.product.sku} × {formatCurrency(item.product.price)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 bg-white border border-slate-100 rounded-lg shadow-2xs">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-l-lg hover:bg-slate-50"
                        onClick={() => updateQuantity(item.product.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-7 text-center font-bold text-xs text-slate-800">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-r-lg hover:bg-slate-50"
                        onClick={() => updateQuantity(item.product.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right min-w-[65px]">
                      <p className="font-bold text-sm text-slate-900">{formatCurrency(item.product.price * item.quantity)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount Block */}
          {cart.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3 bg-white shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Tag className="h-4 w-4 text-slate-400" />
                  <span>Discount Rate:</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {[0, 5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setDiscountPercent(pct)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-bold transition-all border",
                        discountPercent === pct
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cart Totals Footer */}
          <div className="border-t border-slate-200 bg-slate-50 p-4 rounded-b-xl shrink-0">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-medium text-slate-800">{formatCurrency(cartTotals.subtotal)}</span>
              </div>
              {cartTotals.discount > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Discount ({discountPercent}%)</span>
                  <span>-{formatCurrency(cartTotals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>Tax Matrix (VAT)</span>
                <span className="font-medium text-slate-800">{formatCurrency(cartTotals.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2.5 items-center">
                <span className="font-bold text-slate-900 text-base">Grand Total</span>
                <span className="font-black text-2xl text-indigo-600">{formatCurrency(cartTotals.total)}</span>
              </div>
            </div>

            {/* Payment Button */}
            <Button
              className="mt-4 w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm gap-2"
              disabled={cart.length === 0 || isLoading}
              onClick={() => setShowPaymentDialog(true)}
            >
              <CreditCard className="h-5 w-5" />
              Pay {formatCurrency(cartTotals.total)}
            </Button>
          </div>
        </div>
      </div>

      <BarcodeScannerDialog
        open={showScannerDialog}
        onOpenChange={setShowScannerDialog}
        onDetected={addByCode}
      />

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto w-[94vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-600" />
              Process Payment
            </DialogTitle>
            <DialogDescription>
              Total amount: <span className="font-bold text-slate-900 text-lg">{formatCurrency(cartTotals.total)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 transition-all shadow-2xs",
                  paymentMethod === "cash"
                    ? "border-indigo-600 bg-indigo-50/60 font-semibold text-indigo-700"
                    : "border-slate-200 bg-white hover:border-indigo-300 text-slate-600"
                )}
              >
                <Banknote className="h-8 w-8 text-slate-500" />
                <span className="text-sm">Cash</span>
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 transition-all shadow-2xs",
                  paymentMethod === "card"
                    ? "border-indigo-600 bg-indigo-50/60 font-semibold text-indigo-700"
                    : "border-slate-200 bg-white hover:border-indigo-300 text-slate-600"
                )}
              >
                <CreditCard className="h-8 w-8 text-slate-500" />
                <span className="text-sm">Card</span>
              </button>
              <button
                onClick={() => setPaymentMethod("mobile")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 transition-all shadow-2xs",
                  paymentMethod === "mobile"
                    ? "border-indigo-600 bg-indigo-50/60 font-semibold text-indigo-700"
                    : "border-slate-200 bg-white hover:border-indigo-300 text-slate-600"
                )}
              >
                <Smartphone className="h-8 w-8 text-slate-500" />
                <span className="text-sm">Mobile</span>
              </button>
            </div>

            {paymentMethod === "cash" && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-4 border border-slate-100">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Cash Tendered</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">{symbol}</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-11 text-lg font-bold rounded-xl"
                    style={{ paddingLeft: currencyInputInset(symbol) }}
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    autoFocus
                  />
                </div>
                {changeAmount >= 0 && cashReceived && (
                  <div className="flex justify-between items-center rounded-xl bg-green-100/80 border border-green-200 px-4 py-2.5">
                    <span className="font-semibold text-green-800 text-sm">Change Return</span>
                    <span className="text-xl font-black text-green-900">{formatCurrency(changeAmount)}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[5, 10, 20, 50].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setCashReceived(amount.toString())}
                      className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 shadow-2xs"
                    >
                      {symbol}{amount}
                    </button>
                  ))}
                  <button
                    onClick={() => setCashReceived((cartTotals.total / 100).toFixed(2))}
                    className="rounded-lg bg-indigo-100 border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs ml-auto"
                  >
                    Exact Amount
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2.5 border-t border-slate-100 pt-3 mt-1">
            <Button variant="outline" className="flex-1 h-11 font-semibold rounded-xl" onClick={() => setShowPaymentDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              onClick={processPayment}
              disabled={isProcessing || (paymentMethod === "cash" && (!cashReceived || changeAmount < 0))}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Complete Sale
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-5 w-[94vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col items-center">
              <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 border border-green-200 shadow-sm">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <DialogTitle className="text-center text-xl font-bold text-slate-900">Payment Successful!</DialogTitle>
              <DialogDescription className="text-center font-mono text-xs text-slate-400 mt-0.5">
                Receipt No: {lastSale?.receiptNo}
              </DialogDescription>
            </div>
          </DialogHeader>

          {lastSale && (
            <div className="space-y-4 pt-1">
              <div className="rounded-xl bg-slate-50 p-4 font-mono text-xs space-y-2 border border-slate-100 shadow-inner">
                <div className="text-center border-b border-dashed border-slate-300 pb-2">
                  <p className="font-bold text-sm text-slate-800">{businessName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(lastSale.createdAt).toLocaleString()}</p>
                </div>
                <div className="space-y-1.5 py-1 max-h-32 overflow-y-auto">
                  {lastSale.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-slate-700">
                      <span>{item.quantity}× {item.product.name.substring(0, 18)}</span>
                      <span className="font-semibold">{formatCurrency(item.product.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(lastSale.subtotal)}</span>
                  </div>
                  {lastSale.discount > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Discount</span>
                      <span>-{formatCurrency(lastSale.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Tax (VAT)</span>
                    <span>{formatCurrency(lastSale.tax)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-200 pt-1.5 items-center">
                    <span>TOTAL</span>
                    <span className="text-base text-indigo-600">{formatCurrency(lastSale.total)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 border-solid space-y-0.5">
                  <p>Method: {lastSale.paymentMethod.replace("_", " ").toUpperCase()}</p>
                  {lastSale.cashReceived && (
                    <>
                      <p>Received: {formatCurrency(lastSale.cashReceived)}</p>
                      <p>Change Return: {formatCurrency(lastSale.change || 0)}</p>
                    </>
                  )}
                </div>
                <div className="text-center text-[11px] text-slate-400 font-medium pt-2">
                  <p>Thank you for your business!</p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <Button variant="outline" className="flex-1 h-10 font-semibold rounded-xl border-slate-200" onClick={() => setShowReceiptDialog(false)}>
                  Close
                </Button>
                <Button 
                  className="flex-1 h-10 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm gap-2"
                  onClick={handlePrintReceipt}
                >
                  <Printer className="h-4 w-4" />
                  Print Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}