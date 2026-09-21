"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link"; // 🚀 Added Link import for navigation
import { 
  ShieldAlert, 
  Search, 
  Calendar, 
  User, 
  RefreshCw, 
  ArrowUpDown, 
  FileSpreadsheet, 
  Layers,
  ChevronLeft,
  ChevronRight,
  ArrowLeft // 🚀 Added ArrowLeft icon
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Explicit log entry types matching enterprise audit rules
export type AuditLogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "POST" | "VOID";
  module: "INVOICE" | "BILL" | "CONTACT" | "LEDGER" | "SETTINGS";
  documentRef: string;
  description: string;
  ipAddress: string;
};

type AuditLogsViewProps = {
  initialLogs: AuditLogEntry[];
  onRefresh?: () => Promise<void>;
};

const actionStyles: Record<AuditLogEntry["action"], string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-rose-50 text-red-700 border-red-200",
  POST: "bg-blue-50 text-blue-700 border-blue-200",
  VOID: "bg-slate-100 text-slate-700 border-slate-300",
};

export function AuditLogsView({ initialLogs, onRefresh }: AuditLogsViewProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ✅ Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // ✅ Reset to page 1 whenever a filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, moduleFilter, actionFilter]);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  // Safe live tracking filters
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch = 
        log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.documentRef.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesModule = moduleFilter === "all" || log.module === moduleFilter;
      const matchesAction = actionFilter === "all" || log.action === actionFilter;

      return matchesSearch && matchesModule && matchesAction;
    });
  }, [logs, searchQuery, moduleFilter, actionFilter]);

  // ✅ Paginate the filtered logs
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const handleExportCSV = () => {
    const headers = ["Timestamp", "User ID", "User Name", "Action", "Module", "Document Ref", "Description", "IP Address"];
    const rows = filteredLogs.map(l => [
      `"${l.timestamp}"`,
      `"${l.userId}"`,
      `"${l.userName}"`,
      `"${l.action}"`,
      `"${l.module}"`,
      `"${l.documentRef}"`,
      `"${l.description.replace(/"/g, '""')}"`,
      `"${l.ipAddress}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Wawprofi_System_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6 pb-8 animate-in fade-in duration-300">
      
      {/* 🚀 NEW: Back Button Link directly matches your workspace layout */}
      <Link 
        href="/reports" 
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Report Center
      </Link>

      {/* Top Section Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl flex items-center gap-2">
            System Audit Trail Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable tracking ledger capturing state mutations, record definitions, and critical system events.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing || !onRefresh}
            className="h-10 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <RefreshCw className={`size-4 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="h-10 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <FileSpreadsheet className="size-4 text-slate-500" />
            <span>Export Trail</span>
          </Button>
        </div>
      </div>

      {/* Security Advisory Callout banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 flex gap-3 items-start text-sm text-blue-800 leading-relaxed shadow-sm">
        <ShieldAlert className="size-5 text-blue-600 mt-0.5 shrink-0" />
        <p>
          <strong>Compliance Protocol Notice:</strong> This audit ledger streams security logs directly to an isolated database state table schema profile layer. Timestamps are verified uniformly under universal atomic standards to maintain non-repudiation properties required by certified tax auditors.
        </p>
      </div>

      {/* Grid Filters Control Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        
        {/* Search Parameter */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-3 size-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search logs, entries, entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Module Filter */}
        <div className="relative w-full">
          <Layers className="absolute left-3 top-3 size-4 text-slate-400 pointer-events-none" />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium outline-none cursor-pointer focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700"
          >
            <option value="all">All Sub-Modules</option>
            <option value="INVOICE">Invoices Engine</option>
            <option value="BILL">Supplier Bills</option>
            <option value="CONTACT">Contacts Directory</option>
            <option value="LEDGER">General Ledger Core</option>
            <option value="SETTINGS">Global Configuration</option>
          </select>
        </div>

        {/* Action Type Filter */}
        <div className="relative w-full">
          <ArrowUpDown className="absolute left-3 top-3 size-4 text-slate-400 pointer-events-none" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium outline-none cursor-pointer focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700"
          >
            <option value="all">All Mutation Hooks</option>
            <option value="CREATE">CREATE Ledger</option>
            <option value="UPDATE">UPDATE Adjustments</option>
            <option value="DELETE">DELETE Events</option>
            <option value="POST">POST Finalize</option>
            <option value="VOID">VOID Actions</option>
          </select>
        </div>
      </div>

      {/* Main Logs Table Ledger Output */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <ShieldAlert className="size-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-800">No system events discovered</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              No audit records pass current filtering matrix constraints on database workspace loops.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                    <th className="px-5 py-3.5 whitespace-nowrap">Timestamp Standards</th>
                    <th className="px-4 py-3.5">System User</th>
                    <th className="px-4 py-3.5">Mutation Hook</th>
                    <th className="px-4 py-3.5">Target Module</th>
                    <th className="px-4 py-3.5">Log Reference Desc</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 text-xs text-slate-500 font-mono whitespace-nowrap flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 font-bold text-slate-700">
                          <Calendar className="size-3" /> {log.timestamp.split(" ")[0]}
                        </span>
                        <span>{log.timestamp.split(" ")[1] || ""}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="size-6 bg-slate-100 rounded-full border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">
                            <User className="size-3" />
                          </div>
                          <div className="text-xs">
                            <p className="font-bold text-slate-800 leading-none mb-0.5">{log.userName}</p>
                            <p className="text-slate-400 font-mono tracking-tighter">ID: {log.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${actionStyles[log.action]}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-slate-600">
                        {log.module}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 max-w-sm">
                        <span className="font-bold text-slate-800 block mb-0.5 font-mono tracking-tight">{log.documentRef}</span>
                        <p className="leading-normal text-slate-500 font-medium">{log.description}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-400 whitespace-nowrap">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6 mt-auto">
                <div className="text-xs font-semibold text-slate-500">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} – {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} logs
                </div>
                
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-slate-200 bg-white hover:bg-slate-100"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  
                  <div className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">
                    Page {currentPage} of {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-slate-200 bg-white hover:bg-slate-100"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}