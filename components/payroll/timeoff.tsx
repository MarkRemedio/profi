"use client";

import { useState } from "react";
import {
  Calendar,
  Plus,
  Clock,
  Umbrella,
  Heart,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const leaveBalance = {
  annual: { used: 15, total: 25, pending: 2 },
  sick: { used: 3, total: 10, pending: 0 },
  personal: { used: 1, total: 5, pending: 0 },
};

const leaveRequests = [
  { id: "1", type: "Annual Leave", startDate: "2024-03-15", endDate: "2024-03-20", days: 6, status: "approved", reason: "Family vacation" },
  { id: "2", type: "Sick Leave", startDate: "2024-02-10", endDate: "2024-02-11", days: 2, status: "approved", reason: "Flu" },
  { id: "3", type: "Annual Leave", startDate: "2024-04-22", endDate: "2024-04-24", days: 3, status: "pending", reason: "Personal matters" },
  { id: "4", type: "Personal Leave", startDate: "2024-01-05", endDate: "2024-01-05", days: 1, status: "approved", reason: "Bank appointment" },
];

const policies = [
  { name: "Standard Annual Leave", days: 25, carryOver: 5, description: "25 days per year, 5 days can be carried over" },
  { name: "Sick Leave", days: 10, carryOver: 0, description: "10 days paid sick leave per year" },
  { name: "Personal Leave", days: 5, carryOver: 0, description: "5 days for personal appointments" },
];

export function TimeOff() {
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time Off</h1>
          <p className="text-sm text-slate-500">Request leave and check your balance</p>
        </div>
        <Button 
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={() => setShowRequestDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Request Leave
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Umbrella className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Annual Leave</p>
              <p className="text-2xl font-bold text-slate-900">{leaveBalance.annual.total - leaveBalance.annual.used - leaveBalance.annual.pending}</p>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Used: {leaveBalance.annual.used}</span>
            <span className="text-amber-600">Pending: {leaveBalance.annual.pending}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Heart className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Sick Leave</p>
              <p className="text-2xl font-bold text-slate-900">{leaveBalance.sick.total - leaveBalance.sick.used}</p>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Used: {leaveBalance.sick.used}</span>
            <span className="text-slate-400">Total: {leaveBalance.sick.total}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Personal Leave</p>
              <p className="text-2xl font-bold text-slate-900">{leaveBalance.personal.total - leaveBalance.personal.used}</p>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Used: {leaveBalance.personal.used}</span>
            <span className="text-slate-400">Total: {leaveBalance.personal.total}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Requests */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Requests
          </h3>
          <div className="space-y-3">
            {leaveRequests.map((request) => (
              <div key={request.id} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary">{request.type}</Badge>
                  <Badge className={
                    request.status === "approved" ? "bg-green-100 text-green-700" :
                    request.status === "pending" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }>
                    {request.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {request.status === "pending" && <Hourglass className="h-3 w-3 mr-1" />}
                    {request.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                    {request.status}
                  </Badge>
                </div>
                <p className="font-medium text-slate-900">{request.startDate} - {request.endDate}</p>
                <p className="text-sm text-slate-500">{request.days} days • {request.reason}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Policies */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Leave Policies
          </h3>
          <div className="space-y-3">
            {policies.map((policy) => (
              <div key={policy.name} className="p-4 bg-slate-50 rounded-lg">
                <p className="font-medium text-slate-900">{policy.name}</p>
                <p className="text-sm text-slate-500">{policy.description}</p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="text-slate-600">{policy.days} days/year</span>
                  {policy.carryOver > 0 && <span className="text-blue-600">{policy.carryOver} days carry over</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>Submit a new leave request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Leave Type</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual Leave</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="personal">Personal Leave</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Input placeholder="Brief description..." />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { setShowRequestDialog(false); toast.success("Leave request submitted"); }}>
              Submit Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
