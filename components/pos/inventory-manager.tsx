"use client";

import { useCurrency } from "@/components/currency-provider";
import { currencyInputInset } from "@/lib/currency";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Package,
  Plus,
  Search,
  Barcode,
  Tag,
  AlertTriangle,
  Edit2,
  Trash2,
  Download,
  Upload,
  MoreHorizontal,
  QrCode,
  Boxes,
  TrendingUp,
  TrendingDown,
  Loader2,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosTableSkeleton } from "@/components/pos/skeletons";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { BarcodeImage, generateEan13 } from "@/components/pos/barcode-image";
import type { Product } from "./pos-types";

// Import our server actions
import { getPosProducts, upsertPosProduct, deletePosProduct } from "@/app/(dashboard)/pos/actions";


export function InventoryManager() {
  const { symbol, format } = useCurrency();
  const { format: formatCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [currentTab, setCurrentTab] = useState<"active" | "archived">("active");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Live data states
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productImgInputRef = useRef<HTMLInputElement>(null);

  // Form Field States
  const [formName, setFormName] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formTaxRate, setFormTaxRate] = useState("20");
  const [formStockQuantity, setFormStockQuantity] = useState("0");
  const [formMinStockLevel, setFormMinStockLevel] = useState("5");
  const [formDescription, setFormDescription] = useState("");
  const [formImage, setFormImage] = useState(""); // 👈 New live string Base64 placeholder row state tracker

  // Fetch Live Products
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const result = await getPosProducts();
    if (result.success && result.data) {
      setProducts(result.data as unknown as Product[]);
    } else {
      toast.error("Failed to load live database inventory.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Calculate unique categories present dynamically
  const dynamicCategories = useMemo(() => {
    const unique = new Set(
      products.map((p) => p.category?.trim()).filter(Boolean)
    );
    return Array.from(unique);
  }, [products]);

  // Calculate live database metrics
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const lowStock = products.filter(p => p.stockQuantity <= (p.minStockLevel || 0)).length;
    const outOfStock = products.filter(p => p.stockQuantity === 0).length;
    const totalValue = products.reduce((sum, p) => sum + (p.stockQuantity * (p.costPrice || 0)), 0);
    return { totalProducts, lowStock, outOfStock, totalValue };
  }, [products]);

  // Filter live products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesTab = currentTab === "active" ? p.isActive === true : p.isActive === false;
      const matchesSearch = searchQuery === "" || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.includes(searchQuery);
      const matchesCategory = selectedCategory === "all" || p.category?.toLowerCase() === selectedCategory;
      
      let matchesStock = true;
      if (stockFilter === "low") matchesStock = p.stockQuantity <= (p.minStockLevel || 0) && p.stockQuantity > 0;
      if (stockFilter === "out") matchesStock = p.stockQuantity === 0;
      if (stockFilter === "in") matchesStock = p.stockQuantity > (p.minStockLevel || 0);
      
      return matchesTab && matchesSearch && matchesCategory && matchesStock;
    });
  }, [searchQuery, selectedCategory, stockFilter, products, currentTab]);

  // Handles image uploading with automatic thumbnail resizing and heavy compression
  const handleProductImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        // 🚀 FIXED: Explicitly cast to HTMLCanvasElement so TypeScript knows what this is
        const canvas = document.createElement("canvas") as HTMLCanvasElement;
        
        // 🚀 FIXED: Bumped up the resolution limits to 800px for Retina-quality crispness
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // 🚀 FIXED: Explicitly cast the 2D context to remove the red squiggly error
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          // 🚀 FIXED: Increased JPEG quality to 0.85 (85%) to remove compression artifacts
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
          
          setFormImage(compressedBase64);
          toast.success("Image optimized and attached successfully!");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Barcode Auto-Generator Engine
  const handleAutoGenerateBarcode = () => {
    // Was "50" + 11 random digits, which is EAN-13 length but leaves the check
    // digit to chance, so ~90% of generated codes could not be encoded at all.
    const randomBarcode = generateEan13();
    setFormBarcode(randomBarcode);
    toast.success(`Generated: ${randomBarcode}`);
  };

  // CSV Export processing logic
  const handleExportCSV = () => {
    if (products.length === 0) {
      toast.error("No catalog rows available to export.");
      return;
    }
    const headers = ["Name", "SKU", "Barcode", "Category", "Price(GBP)", "Cost(GBP)", "StockQty", "MinStock", "Description"];
    const csvRows = [
      headers.join(","),
      ...products.map(p => [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku}"`,
        `"${p.barcode || ''}"`,
        `"${p.category || 'General'}"`,
        (p.price / 100).toFixed(2),
        p.costPrice ? (p.costPrice / 100).toFixed(2) : "0.00",
        p.stockQuantity,
        p.minStockLevel || 0,
        `"${(p.description || '').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `POS_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Inventory dataset exported as CSV spreadsheet.");
  };

  // CSV Import sheet runner
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
      if (lines.length <= 1) {
        toast.error("CSV template sheet is missing product rows.");
        return;
      }

      setIsLoading(true);
      let successCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (columns.length >= 5) {
          const clean = (val: string) => val?.replace(/^"|"$/g, '').trim() || "";
          const name = clean(columns[0]);
          const sku = clean(columns[1]);
          const barcode = clean(columns[2]);
          const category = clean(columns[3]);
          const price = clean(columns[4]);
          const costPrice = columns[5] ? clean(columns[5]) : "0.00";
          const stockQuantity = columns[6] ? clean(columns[6]) : "0";
          const minStockLevel = columns[7] ? clean(columns[7]) : "5";
          const description = columns[8] ? clean(columns[8]) : "";

          const res = await upsertPosProduct({
            name, sku, barcode, category, price, costPrice, stockQuantity, minStockLevel, description
          });
          if (res.success) successCount++;
        }
      }

      toast.success(`Successfully uploaded ${successCount} products into database!`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadProducts();
    };
    reader.readAsText(file);
  };

  // Open Add Dialog
  const handleOpenAdd = () => {
    setSelectedProduct(null);
    setFormName("");
    setFormSku("");
    setFormBarcode("");
    setFormCategory("");
    setFormPrice("");
    setFormCostPrice("");
    setFormTaxRate("20");
    setFormStockQuantity("0");
    setFormMinStockLevel("5");
    setFormDescription("");
    setFormImage(""); 
    setShowAddDialog(true);
  };

  // Open Edit Dialog & Populate Fields
  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormName(product.name);
    setFormSku(product.sku);
    setFormBarcode(product.barcode || "");
    setFormCategory(product.category || "");
    setFormPrice((product.price / 100).toFixed(2));
    setFormCostPrice(product.costPrice ? (product.costPrice / 100).toFixed(2) : "");
    setFormTaxRate(product.taxRate.toString());
    setFormStockQuantity(product.stockQuantity.toString());
    setFormMinStockLevel((product.minStockLevel || 5).toString());
    setFormDescription(product.description || "");
setFormImage((product as any).imageUrl || (product as any).image_url || ""); 
setShowAddDialog(true);
  };

  // Save or Update Product Function
  const handleSaveProduct = async () => {
    if (!formName || !formSku || !formPrice) {
      toast.error("Name, SKU, and Price are required fields!");
      return;
    }

    setIsSaving(true);
    const result = await upsertPosProduct({
      id: selectedProduct?.id,
      name: formName,
      sku: formSku,
      barcode: formBarcode,
      category: formCategory.trim() || "General",
      price: formPrice,
      costPrice: formCostPrice || "0",
      taxRate: parseFloat(formTaxRate),
      stockQuantity: formStockQuantity,
      minStockLevel: formMinStockLevel,
      description: formDescription,
      imageUrl: formImage, // Pass upload base64 asset inside Supabase payload rows
    } as any);

    if (result.success) {
      toast.success(selectedProduct ? "Product details updated!" : "New product created successfully!");
      setShowAddDialog(false);
      await loadProducts();
    } else {
      toast.error(result.error || "Failed to sync changes.");
    }
    setIsSaving(false);
  };

  // Delete/Archive handler
  const handleDelete = async (product: Product) => {
    const confirmation = window.confirm(`Are you sure you want to remove "${product.name}"?`);
    if (!confirmation) return;

    setIsLoading(true);
    const result = await deletePosProduct(product.id);
    setIsLoading(false);

    if (result.success) {
      toast.success(result.message);
      await loadProducts();
    } else {
      toast.error(result.error);
    }
  };

  /**
   * Print the rendered label. The SVG is copied into a blank window rather than
   * printing the page, so the surrounding app chrome stays off the label.
   */
  const handlePrintLabel = () => {
    const svg = document.querySelector("#barcode-label-print svg");
    if (!svg || !selectedProduct) {
      toast.error("Nothing to print yet. Wait for the barcode to render.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=420,height=320");
    if (!printWindow) {
      toast.error("Your browser blocked the print window. Allow pop-ups for this site.");
      return;
    }

    const escapeHtml = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    printWindow.document.write(`
      <html>
        <head>
          <title>Label - ${escapeHtml(selectedProduct.name)}</title>
          <style>
            @page { margin: 8mm; }
            body { font-family: system-ui, sans-serif; text-align: center; margin: 0; padding: 12px; }
            .name { font-weight: 700; font-size: 13px; margin-top: 6px; }
            .price { font-weight: 800; font-size: 16px; margin-top: 2px; }
            .sku { font-size: 10px; color: #666; margin-top: 2px; }
          </style>
        </head>
        <body>
          ${svg.outerHTML}
          <div class="name">${escapeHtml(selectedProduct.name)}</div>
          <div class="price">${formatCurrency(selectedProduct.price)}</div>
          <div class="sku">SKU: ${escapeHtml(selectedProduct.sku)}</div>
          <script>
            window.onload = function () {
              window.print();
              setTimeout(function () { window.close(); }, 150);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleGenerateBarcode = (product: Product) => {
    setSelectedProduct(product);
    setShowBarcodeDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Targets for CSV & Image Upload Engines */}
      <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
      <input type="file" ref={productImgInputRef} onChange={handleProductImageChange} accept="image/*" className="hidden" />

      {/* Header - Completely Mobile Responsive Layout Frame */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-sm text-slate-500">Manage products, SKUs, barcodes, and stock levels</p>
        </div>
        
        {/* REDESIGNED BUTTON LAYOUT: Soft shadows, rounded border structures */}
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            className="h-10 px-4 border border-slate-200 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 shadow-sm text-sm gap-2 flex-1 sm:flex-initial" 
            onClick={handleExportCSV} 
            disabled={isLoading}
          >
            <Download className="h-4 w-4 text-slate-500" /> Export
          </Button>
          <Button 
            variant="outline" 
            className="h-10 px-4 border border-slate-200 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 shadow-sm text-sm gap-2 flex-1 sm:flex-initial" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isLoading}
          >
            <Upload className="h-4 w-4 text-slate-500" /> Import
          </Button>
          <Button 
            className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm text-sm gap-2 w-full sm:w-auto"
            onClick={handleOpenAdd}
            disabled={isLoading}
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Stats Cards Dashboard Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Products</p>
              <p className="text-2xl font-bold text-slate-900">{isLoading ? "..." : stats.totalProducts}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Low Stock</p>
              <p className="text-2xl font-bold text-amber-600">{isLoading ? "..." : stats.lowStock}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600">{isLoading ? "..." : stats.outOfStock}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Inventory Value</p>
              <p className="text-2xl font-bold text-green-600">{isLoading ? "..." : formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Inputs Panel Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, SKU, or barcode..."
            className="pl-9 h-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[195px] h-10 rounded-xl capitalize">
              <Tag className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {dynamicCategories.map(cat => (
                <SelectItem key={cat} value={cat?.toLowerCase() || ""} className="capitalize">
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-[145px] h-10 rounded-xl">
              <Boxes className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock</SelectItem>
              <SelectItem value="in">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View Tabs Selector */}
      <div className="flex border-b border-slate-200 text-sm overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          className={cn(
            "px-5 py-3 font-semibold border-b-2 transition-all",
            currentTab === "active"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
          onClick={() => setCurrentTab("active")}
        >
          Active Catalog ({products.filter(p => p.isActive).length})
        </button>
        <button
          className={cn(
            "px-5 py-3 font-semibold border-b-2 transition-all",
            currentTab === "archived"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
          onClick={() => setCurrentTab("archived")}
        >
          Archived / Inactive ({products.filter(p => !p.isActive).length})
        </button>
      </div>

      {/* Products Table Wrapper Container */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
        {isLoading ? (
          <PosTableSkeleton columns={7} rows={6} label="Loading catalog" />
        ) : (
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">SKU / Barcode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Price</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Stock</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50/70 transition group">
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-3">
                      {/* Photo Thumbnail Element Integration */}
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 overflow-hidden shadow-inner">
  {((product as any).imageUrl || (product as any).image_url) ? (
    <img src={(product as any).imageUrl || (product as any).image_url} alt={product.name} className="h-full w-full object-cover" />
  ) : (
    <Package className="h-5 w-5 text-slate-400" />
  )}
</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                        <p className="text-xs text-slate-400 line-clamp-1">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="space-y-0.5">
                      <p className="text-xs font-mono font-medium text-slate-600">{product.sku}</p>
                      {product.barcode && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Barcode className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{product.barcode}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {product.category && (
                      <Badge variant="secondary" className="text-xs font-medium tracking-wide capitalize bg-slate-100 text-slate-700 rounded-md border-0">
                        {product.category}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <p className="font-bold text-slate-900">{formatCurrency(product.price)}</p>
                    {product.costPrice && (
                      <p className="text-xs text-slate-400">Cost: {formatCurrency(product.costPrice)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={cn(
                        "font-bold text-sm",
                        product.stockQuantity === 0 ? "text-red-600" :
                        product.stockQuantity <= (product.minStockLevel || 0) ? "text-amber-600" :
                        "text-green-600"
                      )}>
                        {product.stockQuantity}
                      </span>
                      {product.stockQuantity <= (product.minStockLevel || 0) && (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <span className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-xs border",
                      product.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {/* Fixed vertical row visual misalignment issue below */}
                  <td className="px-4 py-3 text-right align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          aria-label={`Actions for ${product.name}`}
                          className="h-9 w-9 p-0 ml-auto flex items-center justify-center rounded-xl border-slate-200 bg-white shadow-2xs hover:bg-slate-50 hover:border-slate-300 data-[state=open]:bg-slate-100 data-[state=open]:border-slate-300"
                        >
                          <MoreHorizontal className="h-4 w-4 text-slate-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      {/* REDESIGNED DROPDOWN OVERLAYS: Clean outline styles matching transaction views */}
                      <DropdownMenuContent align="end" className="w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {product.isActive ? (
                          <>
                            <DropdownMenuItem className="rounded-lg h-9 gap-2 cursor-pointer font-medium text-slate-700" onClick={() => handleEdit(product)}>
                              <Edit2 className="h-4 w-4 text-slate-400" /> Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem className="rounded-lg h-9 gap-2 cursor-pointer font-medium text-slate-700" onClick={() => handleGenerateBarcode(product)}>
                              <QrCode className="h-4 w-4 text-slate-400" /> View Barcode
                            </DropdownMenuItem>
                            <DropdownMenuItem 
           className="rounded-lg h-9 gap-2 cursor-pointer font-medium text-amber-600 focus:text-amber-600 focus:bg-amber-50" 
          onClick={async () => {
            const confirmation = window.confirm(`Are you sure you want to archive "${product.name}"?`);
            if (!confirmation) return;

            setIsLoading(true);
            // 🚀 THE FIX: Explicitly updates isActive to false to force it into the Archived tab, bypassing auto-delete!
            const res = await upsertPosProduct({ ...product, isActive: false } as any);
              if (res.success) {
             toast.success(`"${product.name}" moved to archives!`);
              await loadProducts();
             } else {
             toast.error("Failed to archive product.");
            }
              setIsLoading(false);
              }}
            >
              <Trash2 className="h-4 w-4" /> Archive Product
              </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem 
                              className="rounded-lg h-9 gap-2 cursor-pointer font-medium text-green-600 focus:text-green-600 focus:bg-green-50"
                              onClick={async () => {
                                setIsLoading(true);
                                const res = await upsertPosProduct({ ...product, isActive: true } as any);
                                if (res.success) {
                                  toast.success(`"${product.name}" restored to active inventory!`);
                                  await loadProducts();
                                }
                                setIsLoading(false);
                              }}
                            >
                              <Plus className="h-4 w-4" /> Restore to Catalog
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-lg h-9 gap-2 cursor-pointer font-medium text-red-600 focus:text-red-600 focus:bg-red-50"
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 className="h-4 w-4" /> Delete Permanently
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && filteredProducts.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-slate-500">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <p className="text-sm font-medium">No products match your current filters</p>
          </div>
        )}
      </div>

     {/* Add/Edit Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        {/* 👇 FIXED: Added z-50 and custom mobile responsive width to mask background elements */}
        <DialogContent className="w-[94vw] sm:max-w-2xl rounded-2xl p-4 sm:p-6 z-50 gap-0">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold text-slate-900">
              {selectedProduct ? "Edit Product Details" : "Create New Product"}
            </DialogTitle>
            <DialogDescription>
              Provide configuration identifiers and inventory thresholds below.
            </DialogDescription>
          </DialogHeader>

          {/* 👇 FIXED: Added overflow-x-hidden, w-full, and responsive max-height calculation to prevent layout breaks on small phones */}
          <div className="space-y-4 py-1 max-h-[calc(100vh-15rem)] sm:max-h-[68vh] overflow-y-auto overflow-x-hidden pr-1 w-full text-slate-700">
            {/* PHOTO PICKER ROW */}
            <div className="flex items-center gap-4 border border-slate-100 bg-slate-50/50 p-3 rounded-xl">
              <div className="h-16 w-16 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                {formImage ? (
                  <img src={formImage} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <Image className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800">Product Image</p>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-semibold rounded-lg bg-white shadow-xs"
                    onClick={() => productImgInputRef.current?.click()}
                  >
                    Upload Image
                  </Button>
                  {formImage && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs font-semibold rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setFormImage("")}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* PRODUCT NAME & SKU */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product Name *</label>
                <Input placeholder="e.g. Canvas Tote Bag" value={formName} onChange={(e) => setFormName(e.target.value)} className="h-10 rounded-xl w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">SKU Code *</label>
                <Input placeholder="e.g. TOT-BAG-01" value={formSku} onChange={(e) => setFormSku(e.target.value)} className="h-10 rounded-xl w-full" />
              </div>
            </div>

            {/* BARCODE & CATEGORY */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Barcode Identifier</label>
                <div className="flex gap-1.5">
                  <Input placeholder="Scan EAN reference string" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} className="h-10 rounded-xl font-mono text-sm w-full" />
                  <Button variant="outline" size="icon" type="button" className="h-10 w-10 rounded-xl shrink-0 border-slate-200 bg-white" onClick={handleAutoGenerateBarcode} title="Auto Generate Random Barcode">
                    <QrCode className="h-4 w-4 text-slate-500" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Category Tag</label>
                <Input placeholder="e.g. Clothing, Accessories, Food" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="h-10 rounded-xl w-full" />
              </div>
            </div>

            {/* PRICING & TAX MATRIX - Mobile responsive columns spacing stack */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Retail Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{symbol}</span>
                  <Input type="number" step="0.01" className="h-10 rounded-xl font-medium w-full" style={{ paddingLeft: currencyInputInset(symbol) }} value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{symbol}</span>
                  <Input type="number" step="0.01" className="h-10 rounded-xl w-full" style={{ paddingLeft: currencyInputInset(symbol) }} value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tax Matrix</label>
                <Select value={formTaxRate} onValueChange={setFormTaxRate}>
                  <SelectTrigger className="h-10 rounded-xl w-full">
                    <SelectValue placeholder="VAT %" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="0">Standard Exempt (0%)</SelectItem>
                    <SelectItem value="5">Reduced Rate (5%)</SelectItem>
                    <SelectItem value="20">Standard VAT (20%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* STOCK THRESHOLDS */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Starting Stock Quantity</label>
                <Input type="number" value={formStockQuantity} onChange={(e) => setFormStockQuantity(e.target.value)} className="h-10 rounded-xl font-medium w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Min Alert Threshold Level</label>
                <Input type="number" value={formMinStockLevel} onChange={(e) => setFormMinStockLevel(e.target.value)} className="h-10 rounded-xl w-full" />
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal Remarks / Description</label>
              <Input placeholder="Additional material context or structural descriptors..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="h-10 rounded-xl text-sm w-full" />
            </div>
          </div>

          {/* ACTION BUTTONS FOOTER CONTAINER */}
          <div className="flex gap-2.5 pt-4 border-t border-slate-100 mt-4">
            <Button variant="outline" className="flex-1 h-11 font-semibold rounded-xl border-slate-200 text-slate-600" onClick={() => setShowAddDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button className="flex-1 h-11 font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" onClick={handleSaveProduct} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                </>
              ) : selectedProduct ? (
                "Update Details"
              ) : (
                "Create Product"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode Display Window */}
      <Dialog open={showBarcodeDialog} onOpenChange={setShowBarcodeDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <QrCode className="h-5 w-5 text-indigo-600" />
              Barcode Label Output
            </DialogTitle>
            <DialogDescription>
              {selectedProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedProduct && (
              <>
                <div className="flex justify-center">
                  <div id="barcode-label-print" className="rounded-xl bg-white border border-slate-200 p-6 shadow-xs">
                    <BarcodeImage
                      value={selectedProduct.barcode || selectedProduct.sku}
                      className="h-24 w-auto mx-auto"
                    />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="font-bold text-slate-900">{selectedProduct.name}</p>
                  <p className="text-xl font-black text-indigo-600">{formatCurrency(selectedProduct.price)}</p>
                  <p className="text-xs font-mono text-slate-400">SKU: {selectedProduct.sku}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10 font-semibold rounded-xl" onClick={() => setShowBarcodeDialog(false)}>
              Close
            </Button>
            <Button
              className="flex-1 h-10 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
              onClick={handlePrintLabel}
            >
              Print Label
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}