"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOCUMENT_MODULES } from "./registry";

export function DocumentTemplateWorkspace({ activeOrgId }: { activeOrgId: string }) {
  const [activeId, setActiveId] = useState(DOCUMENT_MODULES[0]?.id);
  const active = DOCUMENT_MODULES.find((m) => m.id === activeId) ?? DOCUMENT_MODULES[0];
  const ActiveEditor = active.Editor;

  return (
    <div className="w-full space-y-6 pb-16">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Document Template Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure branding, statutory details, and layout for each document type.
          </p>
        </div>

        <div className="flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm scrollbar-none">
          {DOCUMENT_MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                  activeId === m.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Icon className="size-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Remount editor per tab: key by module id */}
      <ActiveEditor key={active.id} activeOrgId={activeOrgId} />
    </div>
  );
}
