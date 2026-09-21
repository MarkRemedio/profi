"use client";

import { useState } from "react";
import {
  Briefcase,
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  Settings,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const benefitPrograms = [
  { 
    id: "1", 
    name: "Private Health Insurance", 
    provider: "Bupa", 
    cost: 120000, 
    enrolled: 45, 
    status: "active",
    type: "Health",
    employerContribution: 100,
  },
  { 
    id: "2", 
    name: "Pension Scheme", 
    provider: "Aviva", 
    cost: 0, 
    enrolled: 52, 
    status: "active",
    type: "Retirement",
    employerContribution: 5,
  },
  { 
    id: "3", 
    name: "Life Insurance", 
    provider: "Legal & General", 
    cost: 45000, 
    enrolled: 52, 
    status: "active",
    type: "Insurance",
    employerContribution: 100,
  },
  { 
    id: "4", 
    name: "Cycle to Work", 
    provider: "Cyclescheme", 
    cost: 0, 
    enrolled: 12, 
    status: "active",
    type: "Lifestyle",
    employerContribution: 0,
  },
  { 
    id: "5", 
    name: "Gym Membership", 
    provider: "PureGym", 
    cost: 0, 
    enrolled: 28, 
    status: "active",
    type: "Wellness",
    employerContribution: 0,
  },
];

const enrollmentRequests = [
  { id: "1", employee: "Bob Smith", benefit: "Gym Membership", date: "2024-01-10", status: "pending" },
  { id: "2", employee: "Carol White", benefit: "Cycle to Work", date: "2024-01-08", status: "pending" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount / 100);
}

export function BenefitsAdmin() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<typeof benefitPrograms[0] | null>(null);

  const totalCost = benefitPrograms.reduce((sum, p) => sum + p.cost, 0);
  const totalEnrolled = benefitPrograms.reduce((sum, p) => sum + p.enrolled, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Benefits Administration</h1>
          <p className="text-sm text-slate-500">Manage employee benefit programs and enrollment</p>
        </div>
        <Button 
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Add Benefit Program
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Programs</p>
              <p className="text-2xl font-bold text-slate-900">{benefitPrograms.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Enrolled</p>
              <p className="text-2xl font-bold text-green-600">{totalEnrolled}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Monthly Cost</p>
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalCost)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pending</p>
              <p className="text-2xl font-bold text-purple-600">{enrollmentRequests.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Enrollment Requests */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Pending Enrollment Requests
        </h3>
        {enrollmentRequests.length > 0 ? (
          <div className="space-y-3">
            {enrollmentRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{request.employee}</p>
                  <p className="text-sm text-slate-500">{request.benefit} • Requested: {request.date}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="gap-1 text-red-600"
                    onClick={() => toast.success("Request rejected")}
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button 
                    size="sm" 
                    className="gap-1 bg-green-600 hover:bg-green-700"
                    onClick={() => toast.success("Request approved")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">No pending requests</p>
        )}
      </div>

      {/* Benefit Programs */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-900">Benefit Programs</h3>
        </div>
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Program</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Provider</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Cost/Month</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Enrolled</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {benefitPrograms.map((program) => (
              <tr key={program.id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{program.name}</p>
                  <p className="text-xs text-slate-500">{program.employerContribution}% employer contribution</p>
                </td>
                <td className="px-4 py-3 text-sm">{program.provider}</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{program.type}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {program.cost > 0 ? formatCurrency(program.cost) : <span className="text-green-600">Free</span>}
                </td>
                <td className="px-4 py-3 text-right font-medium">{program.enrolled}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className="bg-green-100 text-green-700">{program.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedProgram(program)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Program Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Benefit Program</DialogTitle>
            <DialogDescription>Create a new employee benefit program</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Program Name</label>
              <Input placeholder="e.g., Private Health Insurance" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider</label>
                <Input placeholder="Provider name" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Input placeholder="e.g., Health, Insurance" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Employer Contribution (%)</label>
              <Input type="number" defaultValue={100} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { setShowAddDialog(false); toast.success("Benefit program added"); }}>
              Add Program
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
