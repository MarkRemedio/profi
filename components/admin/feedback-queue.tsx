"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeedbackStatus } from "@prisma/client";
import { ArrowUpDown, Inbox } from "lucide-react";
import { toast } from "sonner";

import {
  promoteFeedbackToRoadmapAction,
  updateFeedbackStatusAction,
} from "@/app/(admin)/admin/(protected)/feedback/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_MODULE_LABELS,
  FEEDBACK_SUB_MODULES,
  type FeedbackModule,
} from "@/lib/feedback/feedback";

export type FeedbackQueueItem = {
  id: string;
  module: string;
  subModule: string;
  details: string;
  attachments: string[];
  pageUrl: string;
  userAgent: string | null;
  status: FeedbackStatus;
  createdAt: string;
  orgName: string;
  reporterName: string;
  reporterEmail: string;
  featureRequestId: string | null;
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  NEW: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DONE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

type StatusFilter = "ALL" | FeedbackStatus;

export function FeedbackQueue({ items }: { items: FeedbackQueueItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modules = useMemo(
    () => Array.from(new Set(items.map((i) => i.module))).sort(),
    [items]
  );

  const visible = useMemo(() => {
    return items
      .filter((i) => statusFilter === "ALL" || i.status === statusFilter)
      .filter((i) => moduleFilter === "all" || i.module === moduleFilter)
      .sort((a, b) =>
        newestFirst
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt)
      );
  }, [items, statusFilter, moduleFilter, newestFirst]);

  function changeStatus(id: string, status: FeedbackStatus) {
    startTransition(async () => {
      try {
        await updateFeedbackStatusAction(id, status);
        router.refresh();
      } catch {
        toast.error("Failed to update status.");
      }
    });
  }

  function promoteToRoadmap(id: string) {
    startTransition(async () => {
      try {
        await promoteFeedbackToRoadmapAction(id);
        toast.success("Added to the roadmap.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to promote to roadmap.");
      }
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Feedback Center</h1>
          <p className="text-sm text-muted-foreground">
            {items.filter((i) => i.status === "NEW").length} new ·{" "}
            {items.length} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="DONE">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {FEEDBACK_MODULE_LABELS[
                    m as keyof typeof FEEDBACK_MODULE_LABELS
                  ] ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewestFirst((v) => !v)}
          >
            <ArrowUpDown className="size-4" />
            {newestFirst ? "Newest first" : "Oldest first"}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-muted-foreground">
          <Inbox className="size-8" />
          <p className="text-sm">No reports match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="min-w-64">Details</TableHead>
                <TableHead>Reporter</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Images</TableHead>
                <TableHead className="w-40">Set status</TableHead>
                <TableHead className="w-36">Roadmap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge
                      className={cn("border-none", STATUS_STYLES[item.status])}
                    >
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">
                    <div>
                      <span>
                        {FEEDBACK_MODULE_LABELS[
                          item.module as keyof typeof FEEDBACK_MODULE_LABELS
                        ] ?? item.module}
                      </span>
                      {item.subModule && (
                        <span className="block text-[11px] text-muted-foreground lowercase mt-0.5">
                          ↳ {
                            (FEEDBACK_SUB_MODULES[item.module as FeedbackModule] || [])
                              .find(s => s.id === item.subModule)?.label ?? item.subModule
                          }
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="max-w-md text-left"
                      onClick={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                    >
                      <p
                        className={cn(
                          "text-sm",
                          expandedId !== item.id && "line-clamp-2"
                        )}
                      >
                        {item.details}
                      </p>
                      {expandedId === item.id && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {item.pageUrl}
                          {item.userAgent ? ` · ${item.userAgent}` : ""}
                        </p>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{item.reporterName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.reporterEmail} · {item.orgName}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.attachments.map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Attachment ${i + 1}`}
                            className="size-10 rounded border object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.status}
                      disabled={isPending}
                      onValueChange={(v) =>
                        changeStatus(item.id, v as FeedbackStatus)
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || Boolean(item.featureRequestId)}
                      onClick={() => promoteToRoadmap(item.id)}
                    >
                      {item.featureRequestId ? "On roadmap" : "Promote"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
