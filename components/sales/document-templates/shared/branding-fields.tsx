"use client";

import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BrandingFieldValues = {
  logo: string | null;
  brandColor: string;
  font: "sans" | "serif" | "mono";
  companyAddress: string;
  vatNumber: string;
  regNumber: string;
  paperSize: "a4" | "letter";
  footer: string;
};

export function BrandingFields<V extends BrandingFieldValues>({
  value,
  onPatch,
}: {
  value: V;
  onPatch: (patch: Partial<BrandingFieldValues>) => void;
}) {
  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onPatch({ logo: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Logo Emblem
        </label>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
            {value.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.logo} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-[10px] font-bold uppercase text-slate-400">No Logo</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="relative h-8 gap-2 text-xs font-bold">
              <Upload className="size-3" /> Upload
              <input
                type="file"
                accept="image/*"
                onChange={onLogoFile}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </Button>
            {value.logo && (
              <Button
                variant="ghost"
                onClick={() => onPatch({ logo: null })}
                className="h-8 text-xs font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1 size-3" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Color / Font / Paper */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Brand Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.brandColor}
              onChange={(e) => onPatch({ brandColor: e.target.value })}
              className="size-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
            />
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-bold uppercase text-slate-600">
              {value.brandColor}
            </span>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Typography
          </label>
          <select
            value={value.font}
            onChange={(e) => onPatch({ font: e.target.value as BrandingFieldValues["font"] })}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          >
            <option value="sans">Modern Sans</option>
            <option value="serif">Classic Serif</option>
            <option value="mono">Technical Mono</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Paper Size
          </label>
          <select
            value={value.paperSize}
            onChange={(e) => onPatch({ paperSize: e.target.value as BrandingFieldValues["paperSize"] })}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
          >
            {/* Worded as the other document tabs word it, so the same choice
                does not read as two different settings. */}
            <option value="a4">A4 Dimension Standard (Global)</option>
            <option value="letter">Letter Dimension Standard (US)</option>
          </select>
        </div>
      </div>

      {/* Statutory */}
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Trading Address
          </label>
          <textarea
            rows={2}
            value={value.companyAddress}
            onChange={(e) => onPatch({ companyAddress: e.target.value })}
            placeholder="e.g. 123 Accounting Lane, London, EC1A 1BB"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              VAT Number
            </label>
            <input
              type="text"
              value={value.vatNumber}
              onChange={(e) => onPatch({ vatNumber: e.target.value })}
              placeholder="e.g. GB 123 4567 89"
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Company Reg No (CRN)
            </label>
            <input
              type="text"
              value={value.regNumber}
              onChange={(e) => onPatch({ regNumber: e.target.value })}
              placeholder="e.g. 01234567"
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Footer
          </label>
          <textarea
            rows={2}
            value={value.footer}
            onChange={(e) => onPatch({ footer: e.target.value })}
            placeholder="e.g. Please remit payment to Bank … Sort 00-00-00 Acct 1234-5678"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
