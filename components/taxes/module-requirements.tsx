"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ModuleRequirement } from "@/lib/accounting/tax-modules";

/**
 * What a tax module needs before it can produce a return.
 *
 * Shown instead of figures where the product does not record enough to compute
 * them. Each item says what is missing and why it matters, and ticks itself off
 * once satisfied — so the page is a route to working, not a dead end.
 *
 * The alternative these screens used to take was to display convincing invented
 * data: five named subcontractors, a property disposal, a £96,500 gain. That
 * reads as real until somebody files on it.
 */
export function ModuleRequirements({
  requirements,
  title = "What this needs to work",
  description,
}: {
  requirements: ModuleRequirement[];
  title?: string;
  description?: string;
}) {
  const done = requirements.filter((requirement) => requirement.satisfied).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-xs font-semibold text-slate-500">
            {done} of {requirements.length} in place
          </span>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {requirements.map((requirement) => (
            <div key={requirement.key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                  requirement.satisfied
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {requirement.satisfied ? (
                  <Check className="size-3" />
                ) : (
                  <Circle className="size-2" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={`m-0 text-sm font-semibold ${
                    requirement.satisfied ? "text-slate-500 line-through" : "text-slate-800"
                  }`}
                >
                  {requirement.label}
                </p>
                <p className="m-0 mt-0.5 text-xs leading-relaxed text-slate-500">
                  {requirement.detail}
                </p>
                {requirement.href && !requirement.satisfied && (
                  <Button asChild size="sm" variant="outline" className="mt-2">
                    <Link href={requirement.href}>Set it up</Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
