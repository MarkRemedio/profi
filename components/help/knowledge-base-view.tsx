"use client";

import { Search, FileText, ChevronRight, LifeBuoy, HelpCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export function KnowledgeBaseView() {
  const popularArticles = [
    "How to connect your first bank feed",
    "Understanding User Roles: Employee vs Accountant",
    "Configuring custom invoice templates",
    "How to run your first automated payroll",
    "Exporting financial reports for HMRC",
    "How to upgrade or change your subscription plan"
  ];

  const faqs = [
    {
      q: "How do I invite a new team member?",
      a: "Go to Settings > Profile & Access. If you are a Workspace Owner, you will see a 'Team Access Management' tab. Click 'Add Team Member', enter their email, assign a role, and we will send them a secure invite link."
    },
    {
      q: "What is the difference between an Employee and an Accountant role?",
      a: "Employees only have access to their personal dashboard and security settings. Accountants have full ledger access (sales, purchases, journals) but cannot access the POS terminal or company billing details."
    },
    {
      q: "How do I reconcile my bank statements?",
      a: "Navigate to the Banking tab. Once your bank feed is connected, you can match incoming and outgoing transactions directly against your sales invoices and purchase bills."
    },
    {
      q: "Can I customize the features a specific user can access?",
      a: "Yes! When inviting or editing a user in Profile & Access, select the 'Custom Role'. This allows you to check specific modules (like Sales, POS, Payroll) they are permitted to view."
    },
    {
      q: "Where do I find my VAT return figures?",
      a: "Head over to the Taxes module and select 'VAT Details'. The system automatically calculates your boxes based on your processed sales and purchases for the given period."
    }
  ];

  return (
    <div className="space-y-10 w-full">
      
      {/* Search Header Section */}
      <div className="bg-slate-900 rounded-[2.5rem] p-10 md:p-16 text-center relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-900 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <LifeBuoy className="size-12 text-blue-400 mx-auto opacity-90" />
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">How can we help you?</h1>
          <p className="text-slate-400 text-sm md:text-base font-medium">Search our knowledge base for guides, tutorials, and troubleshooting.</p>
          
          <div className="relative mt-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-6 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search for articles (e.g., 'Reset password')..." 
              className="w-full h-16 pl-14 pr-6 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white/15 transition-all text-lg backdrop-blur-md"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: FAQs */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <HelpCircle className="size-5 text-blue-600" />
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="p-6 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all">
                <h3 className="font-bold text-slate-900 text-base">{faq.q}</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Popular Articles & Contact Redirect */}
        <div className="space-y-6">
          <h2 className="text-xl font-extrabold text-slate-900">Popular Articles</h2>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-1">
            {popularArticles.map((article, i) => (
              <Link key={i} href="#" className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                <FileText className="size-4 text-blue-500 shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600">{article}</span>
                <ChevronRight className="size-4 text-slate-300 ml-auto shrink-0 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-bold text-blue-900 mb-2">Need more help?</h3>
              <p className="text-sm text-blue-800/80 mb-4">Can't find the answer you're looking for? Our support team is here to help.</p>
              <Link href="/help/contact" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800 transition-colors">
                Contact Support <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}