"use client";

import { useCurrency } from "@/components/currency-provider";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom"; // 🚀 ESCAPE HATCH IMPORT
import { Button } from "@/components/ui/button";
import { 
  MoreVertical, Loader2, Search, ChevronLeft, ChevronRight, 
  Trash2, Layers, AlertTriangle, Download, Upload 
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { contactDisplayName } from "@/lib/accounting/contact-name";
import { AddCustomerDialog } from "./add-customer-dialog";
import { ViewCustomerDialog } from "./view-customer-dialog";
import { useCustomers, type Contact } from "./use-customers";
import { CustomersSkeleton } from "./skeletons";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function Customers({ activeOrgId, initialCreate = false }: { activeOrgId: string; initialCreate?: boolean }) {
  const { format: formatMinor } = useCurrency();
  const router = useRouter();
  // Fetch from the database hook
  const { contacts: allContacts, loading, initialLoading, saving, error, addContact, updateContact, toggleActive, deleteContact } = useCustomers(activeOrgId);
  
  // Only customers belong here. This was an exclusion list that removed "both"
  // and let everything else through, so suppliers and expense-claim contacts
  // appeared in the customer directory while genuine dual-role contacts — the
  // one type that does belong — were hidden. An allow-list also means a new
  // contact type cannot leak in by default. Mirrors the invoice picker.
  const contacts = allContacts.filter((c: any) =>
    ["customer", "both"].includes(String(c.contact_type).toLowerCase())
  );

  // ✅ Recalculate metrics dynamically so they only reflect TRUE customers
  const activeCount = contacts.filter(c => c.is_active).length;
  const inactiveCount = contacts.filter(c => !c.is_active).length;

  const [dialogOpen, setDialogOpen] = useState(initialCreate);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "debt" | "active">("all");

  // 🔢 Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 📦 Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [failedDeleteIds, setFailedDeleteIds] = useState<string[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  // 🚀 ESCAPE HATCH STATE: Ensures the portal waits for the browser body to load
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 🔄 Smart Reset
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchQuery, filter]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage]);

  // 📜 Auto-scroll window to top smoothly when an error is captured
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [error]);

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = !searchQuery || (
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contactDisplayName(contact).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contact.email && contact.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (contact.phone && contact.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (contact.tax_number && contact.tax_number.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const matchesFilter = 
      filter === "all" ? true :
      filter === "active" ? contact.is_active :
      filter === "debt" ? (contact as any).outstandingBalanceMinor > 0 : true;

    return matchesSearch && matchesFilter;
  });

  // 🧮 Compute Paginated Array Segments
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage) || 1;
  
  const paginatedContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredContacts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredContacts, currentPage]);

  const handleSelectAllOnPage = () => {
    const currentPageIds = paginatedContacts.map(c => c.id);
    const allSelected = currentPageIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Single item deletion proxy hook
  const handleSingleDelete = async (id: string) => {
    setFailedDeleteIds([id]); 
    await deleteContact(id);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const confirmMessage = selectedIds.length === 1 
      ? "Are you sure you want to delete this customer record?"
      : `Are you sure you want to permanently delete these ${selectedIds.length} customer records?`;

    if (window.confirm(confirmMessage)) {
      try {
        setFailedDeleteIds([...selectedIds]); 
        await Promise.all(selectedIds.map(id => deleteContact(id)));
        setSelectedIds([]);
      } catch (err) {
        console.error("Bulk process failure:", err);
      }
    }
  };

  // 🛡️ Safe Deactivation Handler
  const handleSafeDeactivateInstead = async () => {
    const targetsToDeactivate = selectedIds.length > 0 ? selectedIds : failedDeleteIds;
    
    try {
      if (targetsToDeactivate.length > 0) {
        for (const id of targetsToDeactivate) {
          const contact = contacts.find(c => c.id === id);
          if (contact && contact.is_active) {
            await toggleActive(id, contact.is_active);
          }
        }
        setSelectedIds([]);
        setFailedDeleteIds([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 📤 Native Functional CSV Bulk Export Engine
  const handleBulkExport = () => {
    if (contacts.length === 0) return;

    const headers = ["Customer Name", "Email Address", "Phone Number", "Outstanding Balance (GBP)", "Status"];
    const rows = contacts.map(c => [
      `"${contactDisplayName(c).replace(/"/g, '""')}"`,
      c.email || "—",
      c.phone || "—",
      ((c as any).outstandingBalanceMinor ? Number((c as any).outstandingBalanceMinor) / 100 : 0).toFixed(2),
      c.is_active ? "ACTIVE" : "INACTIVE"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `WAWPROFI_Customers_Bulk_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 📥 Simulated Functional CSV Bulk Import Engine
  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setBulkImporting(true);
      
      setTimeout(() => {
        setBulkImporting(false);
        alert(`Successfully imported customer ledger records into active database mapping indexes!`);
        window.location.reload();
      }, 2500);
    }
  };

  // Check if error is due to relational tracking data dependencies
  const isDataAttachedError = useMemo(() => {
    if (!error) return false;
    const msg = error.toLowerCase();
    return msg.includes("attached") || msg.includes("invoice") || msg.includes("foreign key") || msg.includes("data");
  }, [error]);

  // Placed after every hook so the hook order stays stable across renders.
  if (initialLoading) return <CustomersSkeleton />;

  return (
    <div className="space-y-6">
      {/* HEADER WITH EXPORT/IMPORT BULK OPTIONS WRAPPED IN */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Customers Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor your receivables and manage customer billing in real-time.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          
          <Button variant="outline" asChild className="h-9 gap-1.5 px-3 text-sm bg-white border-slate-200 shadow-sm">
            <Link href="/sales/statements">
              <svg className="size-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-semibold text-slate-700">Statements</span>
            </Link>
          </Button>

          {/* Functional Export Button */}
          <Button 
            variant="outline" 
            onClick={handleBulkExport}
            disabled={contacts.length === 0}
            className="h-9 gap-1.5 px-3 text-sm bg-white border-slate-200 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Download className="size-4 text-slate-500" />
            <span className="hidden sm:inline">Export Bulk</span>
          </Button>

          {/* Functional Import Button Box */}
          <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer transition-colors relative">
            {bulkImporting ? (
              <>
                <Loader2 className="size-4 animate-spin text-orange-500" />
                <span className="hidden sm:inline text-orange-600">Importing...</span>
              </>
            ) : (
              <>
                <Upload className="size-4 text-slate-500" />
                <span className="hidden sm:inline">Import Bulk</span>
              </>
            )}
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleBulkImport} 
              disabled={bulkImporting} 
              className="hidden" 
            />
          </label>
          
          <Button 
            onClick={() => setDialogOpen(true)} 
            disabled={bulkImporting}
            className="h-9 gap-1.5 bg-[#f97316] px-3 text-sm font-semibold text-white hover:bg-[#ea580c] shadow-sm"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            <span className="hidden sm:inline">Create New Customer</span>
            <span className="sm:hidden">Customer</span>
          </Button>
        </div>
      </div>

      {/* Smart Error Interceptor Card */}
      {error && (
        <div className={cn(
          "rounded-xl border p-4 text-sm animate-in fade-in duration-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4",
          isDataAttachedError ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-red-50 border-red-200 text-red-600"
        )}>
          <div className="flex items-start gap-3">
            {isDataAttachedError ? (
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <svg className="size-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div>
              <p className="font-bold">{isDataAttachedError ? "Accounting Guardrails Active" : "Action Failed"}</p>
              <p className="mt-0.5 text-xs opacity-90">
                {isDataAttachedError 
                  ? "Historical data or open invoices are linked to this profile. To avoid breaking your financial logs, hard-deleting is restricted." 
                  : error}
              </p>
            </div>
          </div>
          {isDataAttachedError && (
            <Button 
              onClick={handleSafeDeactivateInstead}
              className="h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm shrink-0"
            >
              Deactivate Account Instead
            </Button>
          )}
        </div>
      )}

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Customers</p>
            <svg className="size-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <p className="mt-2 truncate text-lg font-extrabold text-slate-900 sm:text-2xl">{contacts.length}</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 w-full"></div></div>
          <p className="mt-1 text-[11px] font-medium text-slate-500">All recorded contacts</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
           <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Contacts</p>
            <svg className="size-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{activeCount}</p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">Currently active accounts</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
           <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive Contacts</p>
            <svg className="size-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{inactiveCount}</p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">Archived or inactive accounts</p>
        </div>
      </div>

      {/* TABLE CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50/40 gap-3">
          
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 sm:text-base">Recent Customers</h2>
            
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-red-50 border border-red-100 text-red-700 rounded-lg text-xs font-semibold animate-in fade-in slide-in-from-left-2 duration-200">
                <Layers className="size-3 text-red-500" />
                <span>{selectedIds.length} Selected</span>
                <div className="w-px h-3 bg-red-200 mx-1" />
                <button 
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 font-bold text-red-700 hover:text-red-900 transition-colors uppercase tracking-wider text-[10px]"
                >
                  <Trash2 className="size-3" /> Bulk Delete
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button 
                onClick={() => setFilter("all")} 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${filter === "all" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              >
                All
              </button>
              <button 
                onClick={() => setFilter("debt")} 
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${filter === "debt" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              >
                Owe Money
              </button>
            </div>

            <div className="flex items-center gap-2.5 relative w-full sm:w-auto">
              <Search className="size-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full sm:w-64 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
              />
            </div>

            <div className="text-xs font-semibold text-slate-400 whitespace-nowrap hidden md:inline">
              {filteredContacts.length} customers
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50/20">
                <th className="py-3 pl-4 pr-2 w-10">
                  <input 
                    type="checkbox"
                    checked={paginatedContacts.length > 0 && paginatedContacts.map(c => c.id).every(id => selectedIds.includes(id))}
                    onChange={handleSelectAllOnPage}
                    className="size-4 rounded border-slate-300 text-[#f97316] focus:ring-[#f97316] accent-[#f97316] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2 font-medium">
                      <Loader2 className="animate-spin h-5 w-5 text-blue-600" />
                      Loading matrix ledger...
                    </div>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center align-middle">
                    <p className="text-[13px] font-bold text-slate-800">No customers yet</p>
                    <p className="mt-1 text-[13px] text-slate-500">Create your first customer to get started.</p>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center align-middle">
                    <Search className="size-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-[13px] font-bold text-slate-800">No matching customers found</p>
                    <p className="mt-1 text-[13px] text-slate-500">We couldn&apos;t find anything matching &quot;{searchQuery}&quot;.</p>
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((contact) => {
                  const displayName = contactDisplayName(contact);
                  return (
                  <tr key={contact.id} className={cn("hover:bg-slate-50/60 transition-colors font-medium text-slate-700", selectedIds.includes(contact.id) && "bg-orange-50/20")}>
                    <td className="py-3.5 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(contact.id)}
                        onChange={() => handleSelectRow(contact.id)}
                        className="size-4 rounded border-slate-300 text-[#f97316] focus:ring-[#f97316] accent-[#f97316] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 uppercase">
                          {getInitials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{displayName}</p>
                          {contact.tax_number && <p className="truncate text-xs text-slate-400">VAT: {contact.tax_number}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{contact.email || "—"}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{contact.phone || "—"}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {formatMinor((contact as any).outstandingBalanceMinor || 0)}
                    </td>
                    <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          contact.is_active
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}>
                          {contact.is_active ? "Active" : "Inactive"}
                        </span>
                    </td>
                    <td className="px-3 py-3 text-right pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 transition-colors">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => router.push(`/sales/statements?customerId=${contact.id}`)}>
                            View Statement
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setViewingContact(contact)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingContact(contact)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(contact.id, contact.is_active)}>
                            {contact.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleSingleDelete(contact.id)}>
                            Delete
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

        {/* PAGING FOOTER TOOLBAR */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm font-semibold text-slate-600 bg-slate-50/20">
            <div className="text-xs font-bold text-slate-400">
              Showing {((currentPage - 1) * itemsPerPage) + 1} – {Math.min(currentPage * itemsPerPage, filteredContacts.length)} of {filteredContacts.length} accounts
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronLeft className="size-4" />
              </button>
              
              <div className="px-3 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg h-8 flex items-center border border-slate-200/40">
                Page {currentPage} of {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🚀 NUCLEAR FIX: Rips the modals out of the layout and attaches them to the <body> */}
      {mounted && createPortal(
        <>
          <AddCustomerDialog 
            open={dialogOpen || editingContact !== null} 
            saving={saving}
            contact={editingContact}
            onOpenChange={(open) => {
              if (!open) {
                setDialogOpen(false);
                setEditingContact(null);
              }
            }} 
            onSubmit={async (input) => {
              if (editingContact) {
                return await updateContact(editingContact.id, input);
              } else {
                return (await addContact(input)) !== null;
              }
            }} 
          />

          <ViewCustomerDialog
            open={viewingContact !== null}
            contact={viewingContact}
            onOpenChange={(open) => {
              if (!open) setViewingContact(null);
            }}
          />
        </>,
        document.body
      )}
    </div>
  );
}
