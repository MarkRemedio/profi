"use client";

import React, { useState, useEffect, startTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { 
  Calendar, 
  Users, 
  Settings, 
  Plus,
  Edit,
  Trash2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

// Absolute path declarations
import { getPayrollSettings } from "@/app/(dashboard)/payroll/actions";
import { getPayrollSchedules } from "@/lib/payroll/schedules";

type PayrollScheduleRow = Awaited<ReturnType<typeof getPayrollSchedules>>[number];

interface PayrollSchedule {
  id: string;
  name: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  payDay: string;
  nextRunDate: string;
  employeeCount: number;
  isActive: boolean;
}

function toScheduleFrequency(frequency: string): PayrollSchedule["frequency"] {
  if (["weekly", "biweekly", "monthly", "quarterly"].includes(frequency)) {
    return frequency as PayrollSchedule["frequency"];
  }
  return "monthly";
}

interface Manager {
  id: string;
  name: string;
  email: string;
  department: string;
  permissions: string[];
  isActive: boolean;
}

interface EmployeeAssignment {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  payrollSchedule: string;
  manager: string;
  startDate: string;
}

const mockSchedules: PayrollSchedule[] = [
  { id: "1", name: "Monthly Payroll", frequency: "monthly", payDay: "25th", nextRunDate: "2024-12-25", employeeCount: 24, isActive: true },
  { id: "2", name: "Bi-weekly Staff", frequency: "biweekly", payDay: "Every other Friday", nextRunDate: "2024-12-20", employeeCount: 8, isActive: true },
  { id: "3", name: "Weekly Contractors", frequency: "weekly", payDay: "Friday", nextRunDate: "2024-12-18", employeeCount: 4, isActive: false }
];

const mockManagers: Manager[] = [
  { id: "1", name: "Jane Manager", email: "jane.manager@company.com", department: "Engineering", permissions: ["approve_timesheets", "view_payroll", "manage_team"], isActive: true },
  { id: "2", name: "John Supervisor", email: "john.supervisor@company.com", department: "Sales", permissions: ["approve_timesheets", "view_team_reports"], isActive: true },
  { id: "3", name: "Sarah Lead", email: "sarah.lead@company.com", department: "Marketing", permissions: ["approve_timesheets"], isActive: false }
];

const mockEmployeeAssignments: EmployeeAssignment[] = [
  { id: "1", employeeName: "John Smith", employeeId: "1", department: "Engineering", payrollSchedule: "Monthly Payroll", manager: "Jane Manager", startDate: "2022-03-15" },
  { id: "2", employeeName: "Sarah Johnson", employeeId: "2", department: "Marketing", payrollSchedule: "Monthly Payroll", manager: "Sarah Lead", startDate: "2021-07-20" },
  { id: "3", employeeName: "Mike Davis", employeeId: "3", department: "Sales", payrollSchedule: "Bi-weekly Staff", manager: "John Supervisor", startDate: "2023-01-10" }
];

export function PayrollSettingsUI() {
  const [schedules, setSchedules] = useState<PayrollSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    startTransition(async () => {
      try {
        const [, schedList] = await Promise.all([
          getPayrollSettings().catch(() => null),
          getPayrollSchedules().catch(() => []),
        ]);
        
        setSchedules(schedList.map((s: PayrollScheduleRow) => ({
          id: s.id,
          name: s.name,
          frequency: toScheduleFrequency(s.frequency),
          payDay: s.frequency === "monthly" ? "25th" : s.frequency === "weekly" ? "Friday" : "Bi-weekly",
          nextRunDate: s.nextPayDate,
          employeeCount: 0,
          isActive: s.status === "active",
        })));
        
        // If DB fails or is empty, use mock data for visualization
        if (schedList.length === 0) {
          setSchedules(mockSchedules);
        }
      } catch {
        toast.error("Failed to load schema settings.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case "weekly": return "Weekly";
      case "biweekly": return "Bi-weekly";
      case "monthly": return "Monthly";
      case "quarterly": return "Quarterly";
      default: return frequency;
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case "approve_timesheets": return "Approve Timesheets";
      case "view_payroll": return "View Payroll";
      case "manage_team": return "Manage Team";
      case "view_team_reports": return "View Team Reports";
      default: return permission;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 w-full text-sm font-semibold text-slate-400 gap-2">
        <Loader2 className="animate-spin size-4 text-blue-600" />
        Loading structural configurations...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payroll Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure automated run schedules, administrative permissions, and team allocations.</p>
        </div>
      </div>

      <Tabs defaultValue="schedules" className="space-y-6">
        <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
          <TabsTrigger value="schedules" className="font-semibold text-xs px-4 data-[state=active]:shadow-sm">Payroll Schedules</TabsTrigger>
          <TabsTrigger value="managers" className="font-semibold text-xs px-4 data-[state=active]:shadow-sm">System Managers</TabsTrigger>
          <TabsTrigger value="assignments" className="font-semibold text-xs px-4 data-[state=active]:shadow-sm">Employee Assignments</TabsTrigger>
        </TabsList>

        {/* TAB 1: SCHEDULES */}
        <TabsContent value="schedules" className="space-y-4 animate-in fade-in duration-300">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Payroll Pipelines</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Define intervals and automated calendar triggers for organizational subgroups.
                  </CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Schedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Create Payroll Pipeline</DialogTitle>
                      <DialogDescription>
                        Set up a recurring structural schedule for financial allocations.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="schedule-name">Schedule Name</Label>
                        <Input id="schedule-name" placeholder="e.g., Monthly Executive Staff" className="h-9 font-medium shadow-3xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="frequency">Frequency</Label>
                        <Select>
                          <SelectTrigger className="h-9 font-medium shadow-3xs">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="pay-day">Pay Day</Label>
                        <Input id="pay-day" placeholder="e.g., 25th, Every Friday" className="h-9 font-medium shadow-3xs" />
                      </div>
                      <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                        <Switch id="active" defaultChecked />
                        <Label htmlFor="active" className="text-sm font-bold text-slate-700 cursor-pointer">Active Schedule</Label>
                      </div>
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button variant="outline" size="sm" className="font-semibold shadow-3xs">Cancel</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">Save Pipeline</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-5">Pipeline Name</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Frequency</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Pay Day</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Next Execution</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Headcount</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Status</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {schedules.map((schedule) => (
                      <TableRow key={schedule.id} className="hover:bg-slate-50/40 transition-colors">
                        <TableCell className="font-bold text-slate-900 py-3 pl-5">{schedule.name}</TableCell>
                        <TableCell className="text-slate-500 py-3">{getFrequencyLabel(schedule.frequency)}</TableCell>
                        <TableCell className="text-slate-500 py-3">{schedule.payDay}</TableCell>
                        <TableCell className="text-slate-900 font-semibold py-3">{new Date(schedule.nextRunDate).toLocaleDateString("en-GB")}</TableCell>
                        <TableCell className="py-3">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-bold">{schedule.employeeCount}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border", schedule.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                            {schedule.isActive ? "Active" : "Paused"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 pr-5">
                          <div className="flex items-center justify-end space-x-1.5">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: MANAGERS */}
        <TabsContent value="managers" className="space-y-4 animate-in fade-in duration-300">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Payroll Administrators</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Assign role-based access controls for timesheet approvals and ledger viewing.
                  </CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Manager
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add Payroll Administrator</DialogTitle>
                      <DialogDescription>Grant secure management permissions to a team lead.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="manager-name">Name</Label>
                        <Input id="manager-name" placeholder="Enter name" className="h-9 font-medium shadow-3xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="manager-email">Email Address</Label>
                        <Input id="manager-email" type="email" placeholder="email@company.com" className="h-9 font-medium shadow-3xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="department">Department Overlay</Label>
                        <Select>
                          <SelectTrigger className="h-9 font-medium shadow-3xs">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="engineering">Engineering</SelectItem>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="hr">Human Resources</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2.5 pt-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Security Claims</Label>
                        <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
                          {["approve_timesheets", "view_payroll", "manage_team", "view_team_reports"].map((permission) => (
                            <div key={permission} className="flex items-center space-x-3">
                              <Switch id={permission} />
                              <Label htmlFor={permission} className="text-xs font-semibold text-slate-700 cursor-pointer">{getPermissionLabel(permission)}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                        <Button variant="outline" size="sm" className="font-semibold shadow-3xs">Cancel</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">Save Permissions</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-5">Identity</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Department</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Claims Assigned</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Status</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {mockManagers.map((manager) => (
                      <TableRow key={manager.id} className="hover:bg-slate-50/40 transition-colors">
                        <TableCell className="py-3 pl-5">
                          <p className="font-bold text-slate-900">{manager.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{manager.email}</p>
                        </TableCell>
                        <TableCell className="text-slate-600 py-3">{manager.department}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {manager.permissions.map((permission) => (
                              <span key={permission} className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                                {getPermissionLabel(permission)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border", manager.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                            {manager.isActive ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 pr-5">
                          <div className="flex items-center justify-end space-x-1.5">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ASSIGNMENTS & SUMMARY */}
        <TabsContent value="assignments" className="space-y-6 animate-in fade-in duration-300">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Employee Assignments</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Map staff to specific organizational schedules and reporting managers.
                  </CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Assignment
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Map Employee Topology</DialogTitle>
                      <DialogDescription>Assign structural relationships for payroll reporting.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Employee Link</Label>
                        <Select>
                          <SelectTrigger className="h-9 font-medium shadow-3xs"><SelectValue placeholder="Select staff member" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="john-smith">John Smith</SelectItem>
                            <SelectItem value="sarah-johnson">Sarah Johnson</SelectItem>
                            <SelectItem value="mike-davis">Mike Davis</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Execution Pipeline</Label>
                        <Select>
                          <SelectTrigger className="h-9 font-medium shadow-3xs"><SelectValue placeholder="Select target schedule" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly Payload</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly Cycle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reporting Manager</Label>
                        <Select>
                          <SelectTrigger className="h-9 font-medium shadow-3xs"><SelectValue placeholder="Assign manager" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="jane-manager">Jane Manager</SelectItem>
                            <SelectItem value="john-supervisor">John Supervisor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Effective Date</Label>
                        <Input type="date" className="h-9 font-medium shadow-3xs" />
                      </div>
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button variant="outline" size="sm" className="font-semibold shadow-3xs">Cancel</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">Save Topology</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-5">Employee</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Pipeline</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Line Manager</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Effective Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {mockEmployeeAssignments.map((assignment) => (
                      <TableRow key={assignment.id} className="hover:bg-slate-50/40 transition-colors">
                        <TableCell className="py-3 pl-5">
                          <p className="font-bold text-slate-900">{assignment.employeeName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{assignment.department}</p>
                        </TableCell>
                        <TableCell className="text-slate-600 font-semibold py-3">{assignment.payrollSchedule}</TableCell>
                        <TableCell className="text-slate-600 py-3">{assignment.manager}</TableCell>
                        <TableCell className="text-slate-500 py-3">{new Date(assignment.startDate).toLocaleDateString("en-GB")}</TableCell>
                        <TableCell className="py-3 pr-5">
                          <div className="flex items-center justify-end space-x-1.5">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* SUMMARY STATS GRID */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Headcount</p>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{mockEmployeeAssignments.length}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg"><Users className="h-5 w-5 text-slate-400" /></div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Pipelines</p>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{mockSchedules.filter(s => s.isActive).length}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg"><Calendar className="h-5 w-5 text-blue-600" /></div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Admin Roles</p>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{mockManagers.filter(m => m.isActive).length}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg"><Settings className="h-5 w-5 text-slate-400" /></div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}