"use client";

import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, FileText, CheckCircle } from "lucide-react";

type ChartOfAccountsStepProps = {
  coaType: string;
  onChange: (value: string) => void;
};

export function ChartOfAccountsStep({ coaType, onChange }: ChartOfAccountsStepProps) {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="text-center mb-6">
        <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
          <Sparkles className="h-6 w-6 md:h-8 md:w-8" />
        </div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">Smart Account Setup</h2>
        <p className="text-slate-500 mt-2 text-sm md:text-base">
          Initialize your core ledger architecture smoothly.
        </p>
      </div>

      {/* 🚀 Perfect Grid Layout - No clipping, perfectly aligned! */}
      <RadioGroup 
        value={coaType} 
        onValueChange={onChange} 
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1 select-none w-full"
      >
        {[
          /* Plain words, and the standard one named as recommended.
             These read "Automated Starter Baseline" and "Clean Slate Ledger
             Setup", which say nothing to somebody who has never kept a ledger
             — and the consequence of the second was buried: a workspace with
             no accounts cannot raise an invoice until somebody builds a chart
             by hand. The option stays, because an accountant migrating from
             another system genuinely wants it, but what it costs is now on the
             card rather than discovered afterwards. */
          {
            id: "starter",
            title: "Standard chart of accounts",
            badge: "Recommended",
            icon: Sparkles,
            color: "border-blue-200 bg-blue-50/20 text-blue-600",
            description: "A complete UK chart, ready for invoices, bills and VAT. You can rename, add or remove accounts at any time."
          },
          {
            id: "manual",
            title: "Start empty",
            badge: null,
            icon: FileText,
            color: "border-slate-200 bg-slate-50/50 text-slate-700",
            description: "No accounts at all. You will need to add or import them before anything can be invoiced or billed — best if you are bringing a chart from another system."
          }
        ].map((item) => {
          const isActive = coaType === item.id;
          const CardIcon = item.icon;
          return (
            <motion.div 
              whileHover={{ scale: 1.01 }} 
              whileTap={{ scale: 0.99 }} 
              key={item.id} 
              className="w-full h-full"
            >
              <Label 
                htmlFor={`coa-${item.id}`} 
                className={`flex flex-col h-full p-6 rounded-2xl border-2 cursor-pointer transition-all relative justify-between bg-white ${
                  isActive ? "border-blue-600 shadow-md ring-4 ring-blue-600/10" : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <RadioGroupItem value={item.id} id={`coa-${item.id}`} className="sr-only" />
                <div className="space-y-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${item.color}`}>
                    <CardIcon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`font-bold text-lg leading-snug ${isActive ? "text-blue-950" : "text-slate-800"}`}>{item.title}</h3>
                    {item.badge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.description}</p>
                </div>
                {isActive && (
                  <div className="absolute top-4 right-4 text-blue-600">
                    <CheckCircle className="h-5 w-5 fill-blue-100" />
                  </div>
                )}
              </Label>
            </motion.div>
          );
        })}
      </RadioGroup>
    </div>
  );
}