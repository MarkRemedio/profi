"use client";

import { CurrencyPicker } from "@/components/currency/currency-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/components/currency-provider";
import React, { useState } from "react";
import {
  Building2,
  Plus,
  Search,
  MoreVertical,
  Mail,
  Phone,
  Loader2,
  Trash2,
  PowerOff,
  Power,
  Layers,
  ChevronDown,
  Tag,
  Hash,
  FileText,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

// ✅ We use your global contacts hook to pull the live data!
import { useCustomers, NewContactInput } from "@/components/sales/use-customers";
import { contactDisplayName } from "@/lib/accounting/contact-name";


export function SuppliersUI({ activeOrgId, initialCreate = false }: { activeOrgId: string; initialCreate?: boolean }) {
  const { format: formatCurrency, currency: workspaceCurrency, multicurrencyEnabled } = useCurrency();
  const { contacts, loading, saving, addContact, updateContact, deleteContact, toggleActive } = useCustomers(activeOrgId);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialCreate);

  // Bulk Delete State
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // ✅ PRO-LEVEL FORM STATE
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  /**
   * Billing address. The bill form prefills its "Supplier address" block from
   * this, so without it every new supplier produced a bill reading
   * "No address on file".
   */
  const [newSupplierAddress, setNewSupplierAddress] = useState("");
  /** Supplier being edited, or null when the modal is adding a new one. */
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [currency, setCurrency] = useState<string>(workspaceCurrency);
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [category, setCategory] = useState("Cost of Goods");
  const [taxNumber, setTaxNumber] = useState("");

  // Filter the master contact list to ONLY show suppliers or dual-contacts
  const suppliersList = contacts.filter(
    (c: any) => c.contact_type === "supplier" || c.contact_type === "both" || c.contact_type === "BOTH"
  );

  // Apply Search Filter
  const filteredSuppliers = suppliersList.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contactDisplayName(s).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredSuppliers.length / ITEMS_PER_PAGE);
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName) return toast.error("Supplier name is required.");

    const input: NewContactInput = {
      name: newSupplierName,
      contact_type: "supplier",
      email: newSupplierEmail,
      phone: newSupplierPhone,
      billing_address: newSupplierAddress,
      default_currency: currency,
      payment_terms_days: parseInt(paymentTerms, 10),
      // We temporarily store the extra data in the notes field so your database accepts it immediately!
      notes: `Category: ${category} | VAT/Tax No: ${taxNumber}`
    };

    const success = editingSupplier
      ? await updateContact(editingSupplier.id, input)
      : await addContact(input);

    if (success) {
      toast.success(editingSupplier ? "Supplier updated." : "Supplier added successfully!");
      closeSupplierModal();
    }
  };

  /** Reset every field so the modal never reopens carrying the last supplier. */
  const closeSupplierModal = () => {
    setIsAddModalOpen(false);
    setEditingSupplier(null);
    setNewSupplierName("");
    setNewSupplierEmail("");
    setNewSupplierPhone("");
    setNewSupplierAddress("");
    setTaxNumber("");
    // The workspace’s currency, not GBP. A supplier’s default flows into every
    // bill raised against them, so resetting to GBP made foreign-currency
    // bills the norm for any workspace that does not bill in sterling.
    setCurrency(workspaceCurrency);
    setPaymentTerms("30");
    setCategory("Cost of Goods");
  };

  const openEditSupplier = (supplier: any) => {
    setEditingSupplier(supplier);
    setNewSupplierName(supplier.name ?? "");
    setNewSupplierEmail(supplier.email ?? "");
    setNewSupplierPhone(supplier.phone ?? "");
    setNewSupplierAddress(supplier.billing_address ?? "");
    setCurrency(supplier.default_currency ?? "GBP"); // currency:allow contact's stored currency
    setPaymentTerms(String(supplier.payment_terms_days ?? 30));
    setIsAddModalOpen(true);
  };

  const handleBulkDelete = async () => {
    if(window.confirm(`Are you sure you want to permanently delete ${selectedSuppliers.length} supplier(s)?`)) {
      let successCount = 0;
      for (const id of selectedSuppliers) {
        await deleteContact(id);
        successCount++;
      }
      setSelectedSuppliers([]);
      toast.success(`${successCount} suppliers deleted successfully.`);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSuppliers.length === paginatedSuppliers.length && paginatedSuppliers.length > 0) {
      setSelectedSuppliers([]);
    } else {
      setSelectedSuppliers(paginatedSuppliers.map(s => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedSuppliers.includes(id)) {
      setSelectedSuppliers(selectedSuppliers.filter(supplierId => supplierId !== id));
    } else {
      setSelectedSuppliers([...selectedSuppliers, id]);
    }
  };

  return (
    <div className="flex-1 space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Suppliers
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track supplier records used for bills and purchasing workflows.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* ✅ NEW: Link to your brand new Statements page! */}
          <Link href="/purchases/statements">
            <Button variant="outline" className="h-9 gap-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <FileText className="size-4" /> Statements
            </Button>
          </Link>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="h-9 gap-1.5 bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm"
          >
            <Plus className="size-4" /> New Supplier
          </Button>
        </div>
      </div>

      {/* ─── DATA TABLE SECTION ─── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col min-h-[500px]">

        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 gap-4 bg-slate-50/30">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 sm:text-base">Supplier Directory</h2>

            {/* Inline Bulk Delete Pill */}
            {selectedSuppliers.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-bold text-[#d32f2f] animate-in fade-in zoom-in-95">
                <div className="flex items-center gap-1.5 px-1">
                  <Layers className="size-3.5" />
                  <span>{selectedSuppliers.length} Selected</span>
                </div>
                <div className="h-3.5 w-[1px] bg-red-200" />
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 px-1 hover:text-red-800 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  <span>BULK DELETE</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="hidden sm:inline-block text-xs font-semibold text-slate-400">{filteredSuppliers.length} records</span>
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm font-medium outline-none transition-all focus:border-blue-400 focus:ring-4 focus:ring-blue-100 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50/50">
                <th className="px-4 py-3 sm:px-6 w-12">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    checked={paginatedSuppliers.length > 0 && selectedSuppliers.length === paginatedSuppliers.length}
                    onChange={toggleSelectAll}
                    disabled={paginatedSuppliers.length === 0}
                  />
                </th>
                <th className="px-3 py-3">Supplier Name</th>
                <th className="px-3 py-3">Contact Details</th>
                <th className="px-3 py-3 text-right">Outstanding Balance</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-24 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin h-5 w-5 text-emerald-600" />
                      Loading directory...
                    </div>
                  </td>
                </tr>
              ) : paginatedSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-24 text-center align-middle">
                    <div className="flex flex-col items-center justify-center">
                      <Building2 className="size-12 text-slate-300 mb-3" />
                      <p className="text-[13px] font-bold text-slate-800">No suppliers found</p>
                      <p className="mt-1 text-[13px] text-slate-500">
                        {searchQuery ? `No vendors match "${searchQuery}"` : "You haven't added any suppliers to your directory yet."}
                      </p>
                      {!searchQuery && (
                        <Button onClick={() => setIsAddModalOpen(true)} variant="outline" className="mt-4 h-8 text-xs font-bold text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
                          Add your first supplier
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((supplier) => {
                  const displayName = contactDisplayName(supplier);
                  return (
                  <tr
                    key={supplier.id}
                    className={cn(
                      "hover:bg-slate-50/60 transition-colors",
                      selectedSuppliers.includes(supplier.id) && "bg-emerald-50/50 hover:bg-emerald-50/80"
                    )}
                  >
                    <td className="px-4 py-3 sm:px-6">
                       <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                        checked={selectedSuppliers.includes(supplier.id)}
                        onChange={() => toggleSelectOne(supplier.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 font-bold text-xs">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{displayName}</p>
                          <p className="text-[11px] text-slate-400 font-normal mt-0.5 tracking-wide">ID: {supplier.id.split('-')[0].toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5 text-xs text-slate-500 font-normal">
                        {supplier.email ? (
                          <span className="flex items-center gap-1.5"><Mail className="size-3.5 text-slate-400" /> {supplier.email}</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-slate-300"><Mail className="size-3.5" /> No email</span>
                        )}
                        {supplier.phone ? (
                          <span className="flex items-center gap-1.5"><Phone className="size-3.5 text-slate-400" /> {supplier.phone}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {supplier.outstandingBalanceMinor && supplier.outstandingBalanceMinor > 0 ? (
                        <>
                          <p className="font-black text-red-600">{formatCurrency(supplier.outstandingBalanceMinor)}</p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">To Pay</p>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">Settled</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {supplier.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => openEditSupplier(supplier)}>
                            <Pencil className="mr-2 size-4 text-slate-400" /> Edit supplier
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => toggleActive(supplier.id, supplier.is_active)}>
                            {supplier.is_active ? <><PowerOff className="size-4 mr-2 text-slate-400" /> Deactivate</> : <><Power className="size-4 mr-2 text-emerald-600" /> Reactivate</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700 font-medium" onClick={() => {
                            if(window.confirm("Are you sure you want to delete this supplier?")) {
                              deleteContact(supplier.id);
                            }
                          }}>
                            <Trash2 className="size-4 mr-2" /> Delete Vendor
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
            <span className="text-xs font-medium text-slate-500">
              Showing <span className="font-bold text-slate-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * ITEMS_PER_PAGE, filteredSuppliers.length)}</span> of <span className="font-bold text-slate-900">{filteredSuppliers.length}</span> records
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── ADD SUPPLIER MODAL ─── */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => (open ? setIsAddModalOpen(true) : closeSupplierModal())}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleAddSupplier}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-5 py-6">

              {/* Primary Contact Info */}
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Supplier / Vendor Name <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100 pl-9"
                    placeholder="e.g. Acme Corp Supplies"
                    required
                  />
                </div>
              </div>

              {/* Grid for Email & Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                    <input
                      type="email"
                      value={newSupplierEmail}
                      onChange={(e) => setNewSupplierEmail(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100 pl-9"
                      placeholder="billing@..."
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 size-4 text-slate-400" />
                    <input
                      type="text"
                      value={newSupplierPhone}
                      onChange={(e) => setNewSupplierPhone(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100 pl-9"
                      placeholder="+44 20..."
                    />
                  </div>
                </div>
              </div>

              {/* Billing address — prefills the supplier address block on bills. */}
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Billing Address</label>
                <textarea
                  value={newSupplierAddress}
                  onChange={(e) => setNewSupplierAddress(e.target.value)}
                  rows={3}
                  className="flex w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="e.g. 123 Trade Street, London, EC1A 1BB"
                />
                <p className="text-[11px] text-slate-400">Used to prefill the supplier address on their bills.</p>
              </div>

              {/* Divider */}
              <div className="h-px bg-slate-100 my-1" />

              {/* Pro Accounting Fields */}
              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Default Expense Category</label>
                {/* The shared select. It brings its own chevron, so the one
                    hand-positioned beside the native control goes with it. */}
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="relative h-10 w-full justify-between bg-white pl-9">
                    <Tag className="pointer-events-none absolute left-3 size-4 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[10000]">
                    <SelectItem value="Cost of Goods">Cost of Goods</SelectItem>
                    <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                    <SelectItem value="Software Subscriptions">Software &amp; SaaS</SelectItem>
                    <SelectItem value="Subcontractors">Subcontractors &amp; Freelancers</SelectItem>
                    <SelectItem value="Travel & Meals">Travel &amp; Meals</SelectItem>
                    <SelectItem value="Other Expenses">Other Expenses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grid for Currency & Terms */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Currency</label>
                  {/* Only meaningful with multicurrency on — the server stamps every
                      bill with the workspace currency while it is off, so offering
                      a choice here promised something that would be ignored.

                      Searchable rather than a flat column of a hundred and one
                      codes, and matched on country name. availableOnly: a
                      supplier can only be billed in a currency the books can
                      keep. */}
                  {multicurrencyEnabled ? (
                    <CurrencyPicker
                      value={currency}
                      onChange={setCurrency}
                      availableOnly
                      size="field"
                    />
                  ) : (
                    <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400">
                      {workspaceCurrency}
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Payment Terms</label>
                  <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                    <SelectTrigger className="h-10 w-full justify-between bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                      <SelectItem value="0">Due on receipt</SelectItem>
                      <SelectItem value="7">Net 7</SelectItem>
                      <SelectItem value="15">Net 15</SelectItem>
                      <SelectItem value="30">Net 30</SelectItem>
                      <SelectItem value="60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Tax / VAT Number <span className="text-[10px] text-slate-400 font-normal lowercase">(Optional)</span></label>
                <div className="relative">
                  <Hash className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-4 focus:ring-blue-100 pl-9"
                    placeholder="e.g. GB123456789"
                  />
                </div>
              </div>

            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)} className="text-slate-600">Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Save Supplier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
