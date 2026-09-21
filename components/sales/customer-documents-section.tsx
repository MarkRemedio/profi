"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  addCustomerDocuments,
  deleteCustomerDocument,
  getCustomerDocumentDownloadUrl,
  getInvoiceAttachmentDownloadUrl,
  listCustomerDocuments,
  updateCustomerDocument,
  type CustomerDocument,
  type CustomerDocumentList,
} from "@/app/(dashboard)/sales/customer-document-actions";
import { uploadContactAttachments } from "./upload-contact-attachments";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** dd/mm/yyyy, matching how dates read across the sales screens. */
function ukDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

type Props = { contactId: string };

export function CustomerDocumentsSection({ contactId }: Props) {
  const [data, setData] = useState<CustomerDocumentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await listCustomerDocuments(contactId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the customer's documents.");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  // The dialog keys this section by contact id, so a fresh mount (with fresh
  // initial state) handles switching customers.
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleUpload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadContactAttachments(files);
      setData(await addCustomerDocuments(contactId, uploaded));
      toast.success(`${uploaded.length} document${uploaded.length === 1 ? "" : "s"} added.`, {
        description: "Add a document date or note so it stays easy to find.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the document.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function startEdit(doc: CustomerDocument) {
    setEditingId(doc.id);
    setEditDate(doc.documentDate ?? "");
    setEditNote(doc.note ?? "");
  }

  async function saveEdit(documentId: string) {
    setSavingEdit(true);
    try {
      const updated = await updateCustomerDocument(documentId, { documentDate: editDate, note: editNote });
      setData((current) =>
        current
          ? { ...current, documents: current.documents.map((doc) => (doc.id === documentId ? updated : doc)) }
          : current,
      );
      setEditingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(doc: CustomerDocument) {
    if (!window.confirm(`Delete "${doc.filename}"? The file will be removed permanently.`)) return;
    setBusyId(doc.id);
    try {
      await deleteCustomerDocument(doc.id);
      setData((current) =>
        current
          ? { ...current, documents: current.documents.filter((item) => item.id !== doc.id) }
          : current,
      );
      toast.success(`${doc.filename} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the document.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(id: string, source: "document" | "invoice") {
    setBusyId(id);
    try {
      const url =
        source === "document"
          ? await getCustomerDocumentDownloadUrl(id)
          : await getInvoiceAttachmentDownloadUrl(id);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the download.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400">Documents</h3>
        <label className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border border-slate-200 px-2.5 py-1.5 cursor-pointer transition-colors ${uploading ? "text-slate-400 bg-slate-50" : "text-slate-700 hover:bg-slate-50"}`}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : "Upload"}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            disabled={uploading}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
            onChange={(event) => handleUpload(Array.from(event.target.files ?? []))}
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
        </div>
      ) : (
        <>
          {(data?.documents.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 py-1">No documents yet — upload contracts, agreements, or certificates for this customer.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data!.documents.map((doc) => (
                <li key={doc.id} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate" title={doc.filename}>{doc.filename}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatSize(doc.sizeBytes)} · Document date: {ukDate(doc.documentDate)}
                        {doc.note ? <span className="text-slate-600"> · {doc.note}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Edit date and note"
                        onClick={() => (editingId === doc.id ? setEditingId(null) : startEdit(doc))}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Download"
                        disabled={busyId === doc.id}
                        onClick={() => handleDownload(doc.id, "document")}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        disabled={busyId === doc.id}
                        onClick={() => handleDelete(doc)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {editingId === doc.id && (
                    <div className="mt-2 ml-7 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(event) => setEditDate(event.target.value)}
                        className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-700"
                        aria-label="Document date"
                      />
                      <input
                        type="text"
                        value={editNote}
                        onChange={(event) => setEditNote(event.target.value)}
                        placeholder="Note (e.g. Signed service agreement)"
                        maxLength={500}
                        className="h-8 flex-1 min-w-[160px] rounded-md border border-slate-200 px-2 text-xs text-slate-700"
                        aria-label="Note"
                      />
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => saveEdit(doc.id)}
                        className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(data?.invoiceDocuments.length ?? 0) > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                From invoices
                <span className="ml-1.5 normal-case font-normal tracking-normal">— files attached to this customer&apos;s invoices</span>
              </p>
              <ul className="divide-y divide-slate-100">
                {data!.invoiceDocuments.map((doc) => (
                  <li key={doc.id} className="py-2 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 truncate" title={doc.filename}>{doc.filename}</p>
                      <p className="text-xs text-slate-500">Invoice {doc.invoiceNo} · {formatSize(doc.sizeBytes)}</p>
                    </div>
                    <button
                      type="button"
                      title="Download"
                      disabled={busyId === doc.id}
                      onClick={() => handleDownload(doc.id, "invoice")}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
