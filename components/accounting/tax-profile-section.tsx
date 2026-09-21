"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { CompaniesHouseLookup } from "@/components/accounting/companies-house-lookup";
import { checkUtr, utrMessage } from "@/lib/tax/utr";
import {
  fillFromCompaniesHouse,
  searchCompaniesHouse,
} from "@/app/(dashboard)/companies-house-actions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TaxProfileDraft = {
  structure: string;
  financialYearEnd: string;
  isCisContractor: boolean;
  companyNumber: string;
  taxReference: string;
  industry: string;
};

export const EMPTY_TAX_PROFILE: TaxProfileDraft = {
  structure: "",
  financialYearEnd: "",
  isCisContractor: false,
  companyNumber: "",
  taxReference: "",
  industry: "",
};

/**
 * What kind of business this is, and when its year ends.
 *
 * These decide which taxes appear at all: a limited company owes corporation
 * tax nine months and a day after its year end, a sole trader files a self
 * assessment the following January, and a contractor files CIS300 monthly. The
 * wizard asks all three at signup and, until now, threw the answers away — so
 * every existing workspace has them blank and the tax dashboard had nothing to
 * work from.
 *
 * No save button of its own, and no load of its own either: the dialog fetches
 * everything in a single call before rendering this, and saves it all together.
 * Loading here as well meant a second server action queued behind the first —
 * Next runs them one at a time — and then overwrote whatever had been typed
 * while it was in flight.
 */
export function TaxProfileSection({
  value,
  onChange,
  canManage,
  error,
}: {
  value: TaxProfileDraft;
  onChange: (next: TaxProfileDraft) => void;
  canManage: boolean;
  error?: string | null;
}) {
  const utrNote = utrMessage(checkUtr(value.taxReference));

  return (
    <div className="space-y-5">
      {/* Above the fields it fills, not beside them: three of these are public
          record and looking them up beats typing them from a certificate. */}
      {canManage && (
        <CompaniesHouseLookup
          search={searchCompaniesHouse}
          load={fillFromCompaniesHouse}
          disabled={!canManage}
          onFill={(company) =>
            onChange({
              ...value,
              companyNumber: company.companyNumber,
              // Each one only overwrites when the register actually said
              // something, so a lookup never blanks a field somebody has
              // already filled in by hand.
              structure: company.structure ?? value.structure,
              financialYearEnd: company.financialYearEnd ?? value.financialYearEnd,
              industry: company.industry ?? value.industry,
            })
          }
        />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Business structure
          </label>
          <Select
            value={value.structure || undefined}
            disabled={!canManage}
            onValueChange={(structure) => onChange({ ...value, structure })}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Not recorded" />
            </SelectTrigger>
            <SelectContent>
              {/* "Private" stated rather than implied: a plain "Limited
                  company" reads as covering a PLC, which is a different filing
                  regime. */}
              <SelectItem value="limited_company">Private limited company (Ltd)</SelectItem>
              <SelectItem value="plc">Public limited company (PLC)</SelectItem>
              <SelectItem value="cic">Community interest company (CIC)</SelectItem>
              <SelectItem value="sole_trader">Sole trader</SelectItem>
              <SelectItem value="partnership">Partnership</SelectItem>
              <SelectItem value="charity">Charity</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            Decides whether you owe corporation tax or file a self assessment.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Financial year end
          </label>
          <Input
            type="date"
            className="h-10"
            value={value.financialYearEnd}
            disabled={!canManage}
            onChange={(event) => onChange({ ...value, financialYearEnd: event.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            Every year-end deadline is counted from this date, and it sets which months your VAT
            quarters end in. Enter this year&apos;s — it rolls forward on its own.
          </p>
        </div>

        {/* All three are quoted on a return: a CT600 wants the UTR and the
            company number, a self assessment the UTR, and payroll the PAYE
            reference. Grouped so they read as one set of registrations. */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Company number
          </label>
          <Input
            className="h-10 font-mono text-sm"
            placeholder="12345678"
            value={value.companyNumber}
            disabled={!canManage}
            onChange={(event) => onChange({ ...value, companyNumber: event.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">From Companies House.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Tax reference (UTR)
          </label>
          <Input
            className="h-10 font-mono text-sm"
            placeholder="12345 67890"
            value={value.taxReference}
            disabled={!canManage}
            onChange={(event) => onChange({ ...value, taxReference: event.target.value })}
          />
          {/* The only reference here that cannot be looked up anywhere, so the
              arithmetic in the number itself is the only check available. */}
          {utrNote ? (
            <p
              className={`mt-1 text-xs font-medium ${
                utrNote.tone === "ok" ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              {utrNote.text}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Your Unique Taxpayer Reference, quoted on every return.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Nature of business
          </label>
          <Input
            className="h-10 text-sm"
            placeholder="e.g. Construction, Professional services"
            value={value.industry}
            disabled={!canManage}
            onChange={(event) => onChange({ ...value, industry: event.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            What the business actually does. Asked at signup and now editable here.
          </p>
        </div>

        {/* No employer PAYE reference here.
            It was offered as "recorded with your other registrations so nobody
            has to find it twice", which was the opposite of what happened:
            nothing in this application ever read it, and payroll keeps its own
            (taxOfficeReference and employersTaxId on payroll_settings, plus a
            payeSenderId on its HMRC credentials) in its own database. Asking
            for it here meant typing it twice, not once. The stored column is
            left alone. */}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
        <Checkbox
          checked={value.isCisContractor}
          disabled={!canManage}
          onCheckedChange={(checked) => onChange({ ...value, isCisContractor: checked === true })}
          className="mt-0.5"
        />
        <div className="text-sm">
          <p className="m-0 font-medium text-slate-800">We pay CIS subcontractors</p>
          <p className="m-0 mt-1 text-xs text-slate-500">
            Contractors file a CIS300 by the 19th of every month, whether or not they made any
            payments.
          </p>
        </div>
      </div>

      {error && <p className="m-0 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
