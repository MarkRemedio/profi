"use client";

import { 
  Mail, 
  PhoneCall, 
  Clock, 
  Send, 
  CheckCircle2, 
  Paperclip, 
  MessageCircle, 
  Activity 
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export function ContactSupportView() {
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSent(true);
    // You can connect this to a server action later!
    setTimeout(() => setIsSent(false), 4000); 
  };

  return (
    // ✅ Flush wrapper with no outer padding to match your dashboard
    <div className="space-y-8 w-full animate-in fade-in">
      
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Contact Support</h1>
        <p className="text-slate-500 mt-2">Need help? Send us a message and our technical team will get back to you shortly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Enhanced Contact Form */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
          {isSent ? (
            <div className="absolute inset-0 bg-white z-10 flex flex-col items-center justify-center text-center p-8 animate-in zoom-in-95 duration-300">
              <div className="size-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="size-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Message Sent!</h3>
              <p className="text-slate-500 mt-2 font-medium">We have received your request. A support agent will reply to your registered email address within 24 hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* 🚀 3-Column Grid for Name, Category, and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Your Name</label>
                  <input type="text" required placeholder="e.g. John Doe" className="w-full h-12 rounded-xl bg-slate-50 border border-slate-200 px-4 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Category</label>
                  <select required className="w-full h-12 rounded-xl bg-slate-50 border border-slate-200 px-4 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-700 font-medium">
                    <option value="">Select issue...</option>
                    <option value="billing">Billing & Subscriptions</option>
                    <option value="technical">Technical Bug / Error</option>
                    <option value="accounting">Accounting Help</option>
                    <option value="other">Other Inquiry</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Priority</label>
                  <select required className="w-full h-12 rounded-xl bg-slate-50 border border-slate-200 px-4 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-slate-700 font-medium">
                    <option value="low">Low (General Q)</option>
                    <option value="normal">Normal (Standard)</option>
                    <option value="high">High (Time-Sensitive)</option>
                    <option value="critical">Critical (Blocked)</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Subject</label>
                <input type="text" required placeholder="Briefly summarize your issue..." className="w-full h-12 rounded-xl bg-slate-50 border border-slate-200 px-4 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Detailed Description</label>
                <textarea required rows={5} placeholder="Please provide as much detail as possible so we can help you faster..." className="w-full rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none" />
              </div>

              {/* 🚀 File Attachment Drag & Drop UI */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Attachments (Optional)</label>
                <div className="w-full h-24 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-xl flex flex-col items-center justify-center text-slate-500 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <Paperclip className="size-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600">Click to upload or drag and drop</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-1">PNG, JPG, or PDF (max. 5MB)</span>
                </div>
              </div>

              <button type="submit" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition-transform active:scale-[0.98]">
                <Send className="size-5" />
                Submit Support Ticket
              </button>
            </form>
          )}
        </div>

        {/* Right Side: Contact Info & Status */}
        <div className="space-y-6">
          
          <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 size-32 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <h3 className="text-lg font-black mb-6">Other ways to connect</h3>
            
            <div className="space-y-6">
              
              {/* 🚀 Added Live Chat Option */}
              <div className="flex gap-4 items-start">
                <div className="size-10 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/10">
                  <MessageCircle className="size-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Live Chat</p>
                  <p className="font-medium text-sm text-white hover:text-blue-300 transition-colors cursor-pointer">Start a conversation</p>
                  <p className="text-xs text-slate-400 mt-1">Usually responds in 5 mins.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="size-10 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/10">
                  <Mail className="size-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Email Us</p>
                  <p className="font-medium text-sm">support@wawprofi.com</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="size-10 bg-white/10 rounded-full flex items-center justify-center shrink-0 border border-white/10">
                  <PhoneCall className="size-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Call Enterprise Line</p>
                  <p className="font-medium text-sm">+44 (0) 20 1234 5678</p>
                  <p className="text-xs text-slate-400 mt-1">Available for Premium plans only.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6 flex items-start gap-4">
            <Clock className="size-6 text-orange-500 shrink-0" />
            <div>
              <h4 className="font-bold text-orange-900">Current Response Time</h4>
              <p className="text-sm text-orange-700/80 mt-1 font-medium">We are currently replying to tickets within <strong className="font-bold text-orange-600">2-4 hours</strong> during normal business operating hours.</p>
            </div>
          </div>

          {/* 🚀 New System Status Badge */}
          <Link href="#" className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between hover:border-blue-300 hover:shadow-sm transition-all group cursor-pointer block">
            <div className="flex items-center gap-4">
              <div className="relative flex h-3 w-3 ml-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">All Systems Operational</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">status.wawprofi.com</p>
              </div>
            </div>
            <Activity className="size-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
          </Link>

        </div>
      </div>
    </div>
  );
}