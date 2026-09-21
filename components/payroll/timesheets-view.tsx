"use client";

import { useState, useEffect, startTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { 
  Clock, 
  Upload, 
  Calendar, 
  Users, 
  Search,
  Plus,
  Edit,
  AlertCircle,
  CheckCircle,
  User,
  Settings,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

// Absolute import pointing directly to your payroll actions file
import { getTimesheets } from "@/app/(dashboard)/payroll/actions";
import { contactDisplayName } from "@/lib/accounting/contact-name";

interface TimesheetEntry {
  id: string;
  employeeName: string;
  employeeId: string;
  payrollSchedule: string;
  weekEnding: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  status: "pending" | "approved" | "rejected";
  lastModified?: string;
  modifiedBy?: string;
  adjustmentNote?: string;
}

interface TimeOffRequest {
  id: string;
  employeeName: string;
  employeeId: string;
  type: "annual" | "sick" | "personal" | "maternity" | "paternity";
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
  approver?: string;
  approvedDate?: string;
}

interface TimeOffPolicy {
  id: string;
  name: string;
  type: string;
  daysAllowed: number;
  daysUsed: number;
  daysRemaining: number;
  accrualRate: string;
}

const mockTimeOffRequests: TimeOffRequest[] = [
  { id: "1", employeeName: "John Smith", employeeId: "1", type: "annual", startDate: "2024-12-20", endDate: "2024-12-24", daysRequested: 5, status: "approved", reason: "Christmas holiday with family", approver: "Jane Manager", approvedDate: "2024-12-01" },
  { id: "2", employeeName: "Sarah Johnson", employeeId: "2", type: "sick", startDate: "2024-12-10", endDate: "2024-12-11", daysRequested: 2, status: "approved", reason: "Flu symptoms", approver: "Jane Manager", approvedDate: "2024-12-12" },
  { id: "3", employeeName: "Mike Davis", employeeId: "3", type: "personal", startDate: "2024-12-28", endDate: "2024-12-29", daysRequested: 2, status: "pending", reason: "Personal appointment" }
];

const mockTimeOffPolicies: TimeOffPolicy[] = [
  { id: "1", name: "Annual Leave", type: "annual", daysAllowed: 25, daysUsed: 15, daysRemaining: 10, accrualRate: "2.08 days per month" },
  { id: "2", name: "Sick Leave", type: "sick", daysAllowed: 10, daysUsed: 3, daysRemaining: 7, accrualRate: "0.83 days per month" },
  { id: "3", name: "Personal Leave", type: "personal", daysAllowed: 5, daysUsed: 1, daysRemaining: 4, accrualRate: "Fixed annually" }
];

export function TimesheetsUI() {
  const [searchTerm, setSearchTerm] = useState("");
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTimesheet, setSelectedTimesheet] = useState<TimesheetEntry | null>(null);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getTimesheets().catch(() => []);
        setTimesheets(data.map((t: any) => ({
          id: t.id,
          employeeName: t.employee?.contact ? contactDisplayName(t.employee.contact) : "Unknown",
          employeeId: t.employeeId,
          payrollSchedule: t.employee?.salaryFrequency ?? "monthly",
          weekEnding: t.periodEnd ? new Date(t.periodEnd).toISOString().slice(0, 10) : "N/A",
          regularHours: Number(t.totalHours || 0),
          overtimeHours: 0,
          totalHours: Number(t.totalHours || 0),
          status: t.status === "PENDING_APPROVAL" ? "pending" : t.status === "APPROVED" ? "approved" : "rejected",
          lastModified: t.updatedAt ? new Date(t.updatedAt).toISOString().slice(0, 10) : undefined,
        })));
      } catch (err) {
        toast.error("Failed to load timesheets");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const filteredTimesheets = timesheets.filter(timesheet =>
    timesheet.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    timesheet.payrollSchedule.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-50 text-green-700 border-green-200";
      case "pending": return "bg-amber-50 text-amber-700 border-amber-200";
      case "rejected": return "bg-red-50 text-red-700 border-red-200";
      default: return "bg-slate-100 text-slate-500 border-slate-200";
    }
  };

  const getTimeOffTypeColor = (type: string) => {
    switch (type) {
      case "annual": return "bg-blue-50 text-blue-700 border-blue-200";
      case "sick": return "bg-red-50 text-red-700 border-red-200";
      case "personal": return "bg-purple-50 text-purple-700 border-purple-200";
      case "maternity": return "bg-pink-50 text-pink-700 border-pink-200";
      case "paternity": return "bg-indigo-50 text-indigo-700 border-indigo-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const handleAdjustHours = () => {
    setShowAdjustmentDialog(false);
    setAdjustmentNote("");
    toast.success("Timesheet adjustments saved.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 w-full text-sm font-semibold text-slate-400 gap-2">
        <Loader2 className="animate-spin size-4 text-blue-600" />
        Loading personnel timesheets and active scheduling rules...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Timesheets & Time-off</h1>
          <p className="text-sm text-slate-500 mt-1">Manage employee hours, approvals, and absence requests.</p>
        </div>
        <Button className="h-9 gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-sm shrink-0">
          <Upload className="size-4" />
          Import Timesheets
        </Button>
      </div>

      <Tabs defaultValue="timesheets" className="space-y-6">
        <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
          <TabsTrigger value="timesheets" className="font-semibold text-xs px-4 data-[state=active]:shadow-sm">Timesheet Approvals</TabsTrigger>
          <TabsTrigger value="timeoff" className="font-semibold text-xs px-4 data-[state=active]:shadow-sm">Time-off Management</TabsTrigger>
        </TabsList>

        <TabsContent value="timesheets" className="space-y-4 animate-in fade-in duration-300">
          {/* Search and Stats */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search timesheets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 border-slate-200 focus-visible:ring-blue-500 text-sm font-medium shadow-2xs w-full"
              />
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0">
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 px-2.5 py-1">
                {timesheets.filter(t => t.status === "pending").length} Pending
              </Badge>
              <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 px-2.5 py-1">
                {timesheets.filter(t => t.status === "approved").length} Approved
              </Badge>
            </div>
          </div>

          {/* Timesheets Table */}
          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <CardTitle className="text-base font-bold text-slate-900">Active Timesheets</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Review and approve logged hours for the active payroll execution period.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-5">Employee</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Schedule</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Week Ending</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Regular</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Overtime</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Total</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Status</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 text-right pr-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {filteredTimesheets.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={8} className="text-center py-12 text-slate-400 font-semibold text-xs">
                           No timesheet records found for this period.
                         </TableCell>
                       </TableRow>
                    ) : (
                      filteredTimesheets.map((timesheet) => (
                        <TableRow key={timesheet.id} className="hover:bg-slate-50/40 transition-colors">
                          <TableCell className="py-3 pl-5">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{timesheet.employeeName}</div>
                                {timesheet.adjustmentNote && (
                                  <div className="text-[10px] font-bold text-orange-600 flex items-center mt-0.5">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Adjusted
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-600 py-3">{timesheet.payrollSchedule}</TableCell>
                          <TableCell className="text-slate-500 py-3">{timesheet.weekEnding}</TableCell>
                          <TableCell className="py-3">{timesheet.regularHours}h</TableCell>
                          <TableCell className="py-3">{timesheet.overtimeHours}h</TableCell>
                          <TableCell className="font-bold text-slate-900 py-3">{timesheet.totalHours}h</TableCell>
                          <TableCell className="py-3">
                            <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border", getStatusColor(timesheet.status))}>
                              {timesheet.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 pr-5">
                            <div className="flex items-center justify-end space-x-1.5">
                              <Dialog open={showAdjustmentDialog && selectedTimesheet?.id === timesheet.id} onOpenChange={(open) => {
                                setShowAdjustmentDialog(open);
                                if (open) setSelectedTimesheet(timesheet);
                              }}>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                  <DialogHeader>
                                    <DialogTitle>Adjust Timesheet</DialogTitle>
                                    <DialogDescription>
                                      Modify operational hours for {selectedTimesheet?.employeeName}
                                    </DialogDescription>
                                  </DialogHeader>
                                  {selectedTimesheet && (
                                    <div className="space-y-4 mt-2">
                                      <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="regular-hours">Regular Hours</Label>
                                          <Input id="regular-hours" type="number" defaultValue={selectedTimesheet.regularHours} className="h-9 font-medium shadow-3xs" />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="overtime-hours">Overtime Hours</Label>
                                          <Input id="overtime-hours" type="number" defaultValue={selectedTimesheet.overtimeHours} className="h-9 font-medium shadow-3xs" />
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="adjustment-note">Adjustment Justification</Label>
                                        <Textarea
                                          id="adjustment-note"
                                          placeholder="Explain why this manual overwrite is required..."
                                          value={adjustmentNote}
                                          onChange={(e) => setAdjustmentNote(e.target.value)}
                                          className="resize-none font-medium shadow-3xs text-sm"
                                        />
                                      </div>

                                      {selectedTimesheet.adjustmentNote && (
                                        <div className="bg-orange-50/50 border border-orange-100 p-3.5 rounded-lg space-y-1">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
                                            Previous Override
                                          </div>
                                          <div className="text-xs font-medium text-orange-900 leading-relaxed">
                                            {selectedTimesheet.adjustmentNote}
                                          </div>
                                          <div className="text-[10px] font-semibold text-orange-600/70 pt-1">
                                            Adjusted by {selectedTimesheet.modifiedBy} on {selectedTimesheet.lastModified}
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex justify-end space-x-2 pt-2 border-t border-slate-50">
                                        <Button variant="outline" size="sm" onClick={() => setShowAdjustmentDialog(false)} className="font-semibold shadow-3xs">
                                          Cancel
                                        </Button>
                                        <Button size="sm" onClick={handleAdjustHours} className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm">
                                          Save Adjustment
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-green-600 hover:bg-green-50" title="Approve">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeoff" className="space-y-4 animate-in fade-in duration-300">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Time-off Policies */}
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-50 py-4 px-5">
                <CardTitle className="text-base font-bold text-slate-900">Company Policies</CardTitle>
                <CardDescription className="text-xs mt-0.5">Active organizational accrual rates.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {mockTimeOffPolicies.map((policy) => (
                  <div key={policy.id} className="border border-slate-100 bg-slate-50/30 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                      <h4 className="font-bold text-slate-900 text-sm">{policy.name}</h4>
                      <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border", getTimeOffTypeColor(policy.type))}>
                        {policy.type}
                      </Badge>
                    </div>
                    <div className="space-y-2.5 text-xs font-semibold">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Days Allowed:</span>
                        <span className="text-slate-900">{policy.daysAllowed}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Days Used:</span>
                        <span className="text-slate-900">{policy.daysUsed}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Remaining Pool:</span>
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">{policy.daysRemaining}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Accrual Rate:</span>
                        <span className="text-slate-900">{policy.accrualRate}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${(policy.daysUsed / policy.daysAllowed) * 100}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2 text-right">
                        {Math.round((policy.daysUsed / policy.daysAllowed) * 100)}% capacity utilized
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full font-semibold border-slate-200 text-slate-700 shadow-2xs hover:bg-slate-50">
                  <Settings className="mr-2 h-4 w-4 text-slate-400" />
                  Manage Global Policies
                </Button>
              </CardContent>
            </Card>

            {/* Recent Time-off Requests */}
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-50 py-4 px-5">
                <CardTitle className="text-base font-bold text-slate-900">Recent Leave Requests</CardTitle>
                <CardDescription className="text-xs mt-0.5">Pending and historical team absence claims.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {mockTimeOffRequests.map((request) => (
                  <div key={request.id} className="border border-slate-100 bg-white rounded-xl p-4 shadow-2xs">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{request.employeeName}</h4>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{request.reason}</p>
                      </div>
                      <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border", getStatusColor(request.status))}>
                        {request.status}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-xs font-semibold bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between text-slate-700">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{request.startDate} — {request.endDate}</span>
                        </div>
                        <Badge className={cn("text-[9px] font-bold uppercase tracking-wider border px-1.5", getTimeOffTypeColor(request.type))}>
                          {request.type}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-1.5 text-slate-700 pt-1">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{request.daysRequested} operational days</span>
                      </div>
                      {request.approver && (
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2 mt-2 border-t border-slate-200/60">
                          Verified by {request.approver} on {request.approvedDate}
                        </div>
                      )}
                    </div>
                    {request.status === "pending" && (
                      <div className="flex space-x-2 mt-4">
                        <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 font-bold shadow-sm">
                          Approve Claim
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 font-semibold text-slate-700 shadow-2xs border-slate-200">
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" className="w-full font-semibold border-slate-200 text-slate-700 shadow-2xs hover:bg-slate-50">
                  <Plus className="mr-2 h-4 w-4 text-slate-400" />
                  View Historical Requests
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}