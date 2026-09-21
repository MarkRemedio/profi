"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

export function FaqSection() {
  const [openIndices, setOpenIndices] = useState<number[]>([0]);

  const toggleFaq = (index: number) => {
    if (openIndices.includes(index)) {
      setOpenIndices(openIndices.filter((i) => i !== index));
    } else {
      setOpenIndices([...openIndices, index]);
    }
  };

  const faqs: FAQItem[] = [
    {
      question: "How long is the demo?",
      answer: "30 min on Zoom or Meet. We share screens, walk through the product with your data.",
    },
    {
      question: "Will it cost me anything?",
      answer: "No. Free under £30k revenue. Forever.",
    },
    {
      question: "Can my accountant join the call?",
      answer: "Yes — encouraged. The portal was built for them.",
    },
    {
      question: "Is my data safe?",
      answer: "Yes. Read-only Open Banking (AISP). UK-resident AWS. ISO 27001 in progress.",
    },
    {
      question: "Which banks do you support?",
      answer: "All major UK banks via Open Banking. Plus Stripe, Wise, PayPal, GoCardless.",
    },
    {
      question: "Can I migrate from another tool?",
      answer: "Yes. ~12 minutes from Xero, QB, FreeAgent or Sage. History comes with you.",
    },
  ];

  return (
    <div className="w-full flex flex-col justify-between">
      
      {/* ─── 1. FAQ ACCORDION BLOCK (CREAM BACKGROUND) ─── */}
      <div className="bg-[#EAEAEA] w-full pt-24 pb-24 border-t border-neutral-300/30">
        <div className="mx-auto max-w-7xl px-6 md:px-8 w-full grid grid-cols-1 lg:grid-cols-[1fr_550px] gap-12 items-start">
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                &middot; COMMONLY ASKED
              </span>
            </div>
            <h2 className="text-4xl font-black tracking-tight text-neutral-900 md:text-5xl max-w-xs leading-[1.1]">
              The questions we get every day.
            </h2>
          </div>

          <div className="divide-y divide-neutral-300/70 border-t border-neutral-300/70">
            {faqs.map((faq, index) => {
              const isOpen = openIndices.includes(index);
              return (
                <div key={index} className="py-5 transition-all duration-300">
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between gap-4 text-left group outline-none"
                  >
                    <span className="text-base font-bold text-neutral-900 tracking-tight sm:text-lg">
                      {faq.question}
                    </span>
                    <div className="text-blue-600 shrink-0 p-1 rounded-full hover:bg-neutral-300/40 transition-colors">
                      {isOpen ? <X className="size-4 stroke-[3]" /> : <Plus className="size-4 stroke-[3]" />}
                    </div>
                  </button>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-in-out text-sm font-medium text-neutral-600 leading-relaxed",
                      isOpen ? "grid-rows-[1fr] opacity-100 pt-3" : "grid-rows-[0fr] opacity-0 overflow-hidden"
                    )}
                  >
                    <div className="overflow-hidden">
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── 2. LAST SECTION (WHITE BACKGROUND WITH MINIMAL METADATA FOOTER) ─── */}
      <div className="bg-white w-full py-10 border-t border-neutral-200/60">
        <footer className="w-full max-w-7xl mx-auto px-6 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono font-bold text-neutral-500 uppercase tracking-wider">
          <div>
            &copy; 2026 WAW GROUP GLOBAL LTD &middot; COMPANY NO. 15842074
          </div>
          <div className="flex items-center gap-6">
            <span className="cursor-pointer hover:text-neutral-900 transition-colors">Privacy</span>
            <span className="cursor-pointer hover:text-neutral-900 transition-colors">Terms</span>
            <span className="cursor-pointer hover:text-neutral-900 transition-colors">DPA</span>
            <span className="cursor-pointer hover:text-neutral-900 transition-colors">Cookies</span>
          </div>
        </footer>
      </div>

    </div>
  );
}