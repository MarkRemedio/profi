import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { AccountCounts } from "./types";

type AccountStatsProps = {
  counts: AccountCounts;
};

export function AccountStats({ counts }: AccountStatsProps) {
  return (
    <section className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-4">
      <StatTile
        label="Total accounts"
        value={counts.total.toString()}
        note={`${counts.active} active`}
        noteClass="bg-green-50 text-green-700"
      />
      <StatTile
        label="Active assets"
        value={counts.asset.toString()}
        note="Balance ready"
        noteClass="text-blue-700"
      />
      <StatTile
        label="Liabilities"
        value={counts.liability.toString()}
        note="Tracked"
        noteClass="text-orange-700"
      />
      <StatTile
        label="Tax mapping"
        value={counts.total > 0 ? "Ready" : "Open"}
        note={counts.total > 0 ? "Defaults applied" : "Add accounts"}
        noteClass="text-slate-500"
      />
    </section>
  );
}

function StatTile({
  label,
  value,
  note,
  noteClass,
}: {
  label: string;
  value: string;
  note: string;
  noteClass: string;
}) {
  return (
    <Card className="rounded-xl border-slate-100 shadow-[0_4px_20px_rgba(37,99,235,0.04)]">
      <CardContent className="px-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-950">{value}</span>
          <span
            className={cn("rounded px-2 py-0.5 text-xs font-semibold", noteClass)}
          >
            {note}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
