"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createContactPerson,
  deleteContactPerson,
  listContactPersons,
  setContactPersonActive,
  updateContactPerson,
  type ContactPersonRow,
} from "@/app/(dashboard)/sales/contact-person-actions";
import { contactPersonInputError } from "@/lib/sales/contact-persons";

type FormState = {
  name: string;
  relationship: string;
  email: string;
  phone: string;
  receivesInvoices: boolean;
  receivesReminders: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  relationship: "",
  email: "",
  phone: "",
  receivesInvoices: false,
  receivesReminders: false,
};

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100";

/**
 * Secondary people on a customer — spouse, accounts manager, and so on.
 * Anyone flagged here is CC'd on invoice emails / payment reminders, so the
 * customer's primary address is never the single point of failure.
 */
export function CustomerContactsSection({ contactId }: { contactId: string }) {
  const [persons, setPersons] = useState<ContactPersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  // "new" opens a blank form; a person id opens that row for editing.
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The dialog remounts this section per customer (keyed on the contact id),
  // so the initial loading state covers the whole fetch.
  useEffect(() => {
    let cancelled = false;
    listContactPersons(contactId).then((result) => {
      if (cancelled) return;
      if (result.success) setPersons(result.persons);
      else toast.error(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditing("new");
  };

  const openEdit = (person: ContactPersonRow) => {
    setForm({
      name: person.name,
      relationship: person.relationship ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
      receivesInvoices: person.receivesInvoices,
      receivesReminders: person.receivesReminders,
    });
    setFormError(null);
    setEditing(person.id);
  };

  const save = async () => {
    const error = contactPersonInputError(form);
    if (error) {
      setFormError(error);
      return;
    }
    setSaving(true);
    const result =
      editing === "new"
        ? await createContactPerson(contactId, form)
        : await updateContactPerson(editing as string, form);
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    setPersons((current) =>
      editing === "new"
        ? [...current, result.person]
        : current.map((p) => (p.id === result.person.id ? result.person : p))
    );
    setEditing(null);
    toast.success(editing === "new" ? `${result.person.name} added` : `${result.person.name} updated`);
  };

  const toggleFlag = async (
    person: ContactPersonRow,
    flag: "receivesInvoices" | "receivesReminders"
  ) => {
    const result = await updateContactPerson(person.id, {
      ...person,
      [flag]: !person[flag],
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPersons((current) => current.map((p) => (p.id === result.person.id ? result.person : p)));
  };

  const toggleActive = async (person: ContactPersonRow) => {
    const result = await setContactPersonActive(person.id, !person.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPersons((current) => current.map((p) => (p.id === result.person.id ? result.person : p)));
    toast.success(
      result.person.isActive
        ? `${result.person.name} reactivated`
        : `${result.person.name} deactivated — they will no longer receive emails`
    );
  };

  const remove = async (person: ContactPersonRow) => {
    if (!window.confirm(`Remove ${person.name} from this customer?`)) return;
    const result = await deleteContactPerson(person.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPersons((current) => current.filter((p) => p.id !== person.id));
    if (editing === person.id) setEditing(null);
    toast.success(`${person.name} removed`);
  };

  return (
    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400">Contacts</h3>
        {editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            + Add contact
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading contacts…</p>
      ) : persons.length === 0 && editing === null ? (
        <p className="text-sm text-slate-500">
          No additional contacts yet.{" "}
          <button type="button" onClick={openNew} className="font-semibold text-blue-600 hover:underline">
            Add one
          </button>{" "}
          to CC them on invoices or reminders.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {persons.map((person) => (
            <li key={person.id} className="py-3 first:pt-0 last:pb-0">
              {editing === person.id ? (
                <PersonForm
                  form={form}
                  error={formError}
                  saving={saving}
                  onChange={setForm}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {person.name}
                      {person.relationship && (
                        <span className="ml-2 text-xs font-normal text-slate-500">{person.relationship}</span>
                      )}
                      {!person.isActive && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {[person.email, person.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={person.receivesInvoices}
                          onChange={() => toggleFlag(person, "receivesInvoices")}
                          disabled={!person.isActive}
                          className="h-3.5 w-3.5 accent-blue-600"
                        />
                        Receives invoices
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={person.receivesReminders}
                          onChange={() => toggleFlag(person, "receivesReminders")}
                          disabled={!person.isActive}
                          className="h-3.5 w-3.5 accent-blue-600"
                        />
                        Receives reminders
                      </label>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => openEdit(person)} className="text-blue-600 hover:text-blue-700 transition-colors">
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleActive(person)} className="text-slate-500 hover:text-slate-700 transition-colors">
                      {person.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button type="button" onClick={() => remove(person)} className="text-red-500 hover:text-red-600 transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === "new" && (
        <div className={persons.length > 0 ? "mt-3 border-t border-slate-100 pt-3" : "mt-3"}>
          <PersonForm
            form={form}
            error={formError}
            saving={saving}
            onChange={setForm}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}

function PersonForm({
  form,
  error,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState;
  error: string | null;
  saving: boolean;
  onChange: (form: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Jane Smith"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Relationship</label>
          <input
            type="text"
            value={form.relationship}
            onChange={(e) => onChange({ ...form, relationship: e.target.value })}
            placeholder="Spouse, Accounts manager…"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })}
            placeholder="name@email.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ ...form, phone: e.target.value })}
            placeholder="+44 7911 123456"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={form.receivesInvoices}
            onChange={(e) => onChange({ ...form, receivesInvoices: e.target.checked })}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Receives invoices
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={form.receivesReminders}
            onChange={(e) => onChange({ ...form, receivesReminders: e.target.checked })}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Receives reminders
        </label>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save contact"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
