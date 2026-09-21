"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getContactPaymentSchedule,
  updateContactPaymentSchedule,
} from "@/app/(dashboard)/sales/payment-schedule-actions";
import type { PaymentSchedule } from "@/lib/accounting/payment-schedule";
import { paymentScheduleLabel } from "@/lib/accounting/payment-schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomerPaymentScheduleSection({ contactId }: { contactId: string }) {
  const [schedule, setSchedule] = useState<PaymentSchedule>({ type: null, day: null });
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void getContactPaymentSchedule(contactId).then((result) => {
      if (!active) return;
      if (result.success) setSchedule(result.schedule);
      else toast.error(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [contactId]);

  function save() {
    startTransition(async () => {
      const result = await updateContactPaymentSchedule(contactId, schedule);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSchedule(result.schedule);
      toast.success("Payment schedule saved");
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-600">
          <CalendarClock className="size-4" />
        </span>
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400">
            Agreed payment day
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Used to prefill due dates and time payment reminders. You can still change an invoice due date.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-10 items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Loading schedule…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-slate-600"
              htmlFor="payment-schedule-type"
            >
              Schedule
            </label>
            <Select
              value={schedule.type ?? "none"}
              onValueChange={(value) =>
                setSchedule(
                  value === "day_of_month"
                    ? {
                        type: "day_of_month",
                        day: schedule.type === "day_of_month" ? schedule.day : 15,
                      }
                    : value === "end_of_month"
                      ? { type: "end_of_month", day: null }
                      : { type: null, day: null },
                )
              }
            >
              <SelectTrigger id="payment-schedule-type" className="h-10 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No agreed day</SelectItem>
                <SelectItem value="day_of_month">Day of month</SelectItem>
                <SelectItem value="end_of_month">End of month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {schedule.type === "day_of_month" ? (
            <div>
              <label
                className="mb-1 block text-xs font-semibold text-slate-600"
                htmlFor="payment-schedule-day"
              >
                Day (1–28)
              </label>
              <Input
                id="payment-schedule-day"
                type="number"
                min={1}
                max={28}
                value={schedule.day}
                onChange={(event) =>
                  setSchedule({ type: "day_of_month", day: Number(event.target.value) })
                }
                className="h-10"
              />
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}

          <Button type="button" onClick={save} disabled={isPending} className="h-10">
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}

      {!loading && (
        <p className="mt-3 text-xs font-medium text-slate-600">
          Current: {paymentScheduleLabel(schedule)}
        </p>
      )}
    </section>
  );
}
