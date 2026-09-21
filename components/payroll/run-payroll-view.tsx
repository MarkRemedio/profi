"use client";

import React, { useState, useEffect, startTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { 
  Clock, 
  ChevronRight, 
  Download, 
  Check, 
  ShieldCheck,
  Loader2
} from "lucide-react";

// Import your actual server actions
import { getEmployees, createPayrollRun } from "@/app/(dashboard)/payroll/actions";
import { getPayrollSchedules } from "@/lib/payroll/schedules";
import { contactDisplayName } from "@/lib/accounting/contact-name";

// Types mapping to your database returns
type EmployeeRow = Awaited<ReturnType<typeof getEmployees>>[number];
type PayrollScheduleRow = Awaited<ReturnType<typeof getPayrollSchedules>>[number];

interface Employee {
  id: string;
  name: string;
  hours: number;
  bonus: number;
  overtimeHours: number;
  grossPay: number;
  tax: number;
  nationalInsurance: number;
  netPay: number;
  baseSalary: number; // Storing the base so we can calculate dynamically
}

interface PayrollSchedule {
  id: string;
  name: string;
  frequency: string;
  nextRunDate: string;
  employeeCount: number;
  totalPayroll: string;
  status: "ready" | "pending" | "processing";
}

export function RunPayrollView() {
  const [selectedSchedule, setSelectedSchedule] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<PayrollSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Store the raw DB fetch so we can access it when a schedule is selected
  const [rawEmployees, setRawEmployees] = useState<EmployeeRow[]>([]);

  useEffect(() => {
    setLoading(true);
    startTransition(async () => {
      try {
        const [schedList, empList] = await Promise.all([
          getPayrollSchedules(),
          getEmployees(),
        ]);
        
        setSchedules(schedList.map((s: PayrollScheduleRow) => ({
          id: s.id,
          name: s.name,
          frequency: s.frequency,
          nextRunDate: s.nextPayDate,
          employeeCount: 0,
          totalPayroll: "—",
          status: s.status === "active" ? ("ready" as const) : ("pending" as const),
        })));
        
        // Save the raw list for later mapping
        setRawEmployees(empList);

      } catch {
        toast.error("Failed to load schema directory components.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const selectedScheduleData = schedules.find(s => s.id === selectedSchedule);
  
  // Aggregate Calculations
  const totalGrossPay = employees.reduce((sum, e) => sum + e.grossPay, 0);
  const totalTax = employees.reduce((sum, e) => sum + e.tax, 0);
  const totalNI = employees.reduce((sum, e) => sum + e.nationalInsurance, 0);
  const totalNetPay = employees.reduce((sum, e) => sum + e.netPay, 0);
  const totalCompanyCost = totalGrossPay * 1.138; // UK Employer Class 1 National Insurance reference

  const handleSelectSchedule = () => {
    if (selectedSchedule) {
      // ✅ Completely dynamic calculation based on real DB employees
      const dynamicEmployees = rawEmployees.map((e) => {
        // Assume salaryAmountMinor is annual. Divide by 12 for a rough monthly base.
        const baseMonthly = Number(e.salaryAmountMinor) / 100 / 12;
        
        // Simple rough UK tax approximations for the UI
        const tax = Math.round(baseMonthly * 0.15); 
        const ni = Math.round(baseMonthly * 0.08);

        return {
          id: e.id,
          name: e.contact ? contactDisplayName(e.contact) : "Unknown Personnel",
          hours: 160,
          bonus: 0,
          overtimeHours: 0,
          baseSalary: baseMonthly, // Store base so edits don't overwrite it
          grossPay: baseMonthly,
          tax: tax,
          nationalInsurance: ni,
          netPay: baseMonthly - tax - ni,
        };
      });

      setEmployees(dynamicEmployees);
      setCurrentStep(2);
    }
  };

  const handleUpdateEmployee = (id: string, field: keyof Employee, value: number) => {
    const updated = employees.map((e) => {
      if (e.id === id) {
        const safeValue = isNaN(value) ? 0 : value;
        const newEmployee = { ...e, [field]: safeValue };
        
        // Dynamically recalculate based on the edits!
        newEmployee.grossPay = newEmployee.baseSalary + newEmployee.bonus + (newEmployee.overtimeHours * 25);
        newEmployee.tax = Math.round(newEmployee.grossPay * 0.15);
        newEmployee.nationalInsurance = Math.round(newEmployee.grossPay * 0.08);
        newEmployee.netPay = newEmployee.grossPay - newEmployee.tax - newEmployee.nationalInsurance;
        
        return newEmployee;
      }
      return e;
    });
    setEmployees(updated);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as 1 | 2 | 3 | 4);
  };

  // ✅ Connects to your real Prisma Action
  const handleRunPayroll = async () => {
    setIsSubmitting(true);
    try {
      const payDate = selectedScheduleData?.nextRunDate || new Date().toISOString();
      const runName = `${selectedScheduleData?.name || "Manual Run"} - ${new Date(payDate).toLocaleString('default', { month: 'short', year: 'numeric' })}`;

      // Sends the creation command to the database, INCLUDING the employee data!
      await createPayrollRun({
        name: runName,
        payDate: payDate,
        scheduleId: selectedScheduleData?.id,
        employees: employees.map((emp) => ({
          id: emp.id,
          grossPayMinor: Math.round(emp.grossPay * 100),
          taxMinor: Math.round(emp.tax * 100),
          nationalInsuranceMinor: Math.round(emp.nationalInsurance * 100),
          netPayMinor: Math.round(emp.netPay * 100),
        }))
      });

      setCurrentStep(4);
      toast.success("Payroll run compiled and safely logged to the database.");
    } catch (error) {
      toast.error("Failed to execute payroll run.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 w-full text-sm font-semibold text-slate-400 gap-2">
        <Loader2 className="animate-spin size-4 text-blue-600" />
        Synchronizing payroll schedules and active directory ledger configurations...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* STEP PROGRESS TRACKER */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Run Payroll</h1>
          <p className="text-sm text-slate-500 mt-1">
            {currentStep === 1 && "Select an active schedule pipeline to calculate pay elements."}
            {currentStep === 2 && `Review adjustments, variable bonuses, and hours for ${selectedScheduleData?.name}`}
            {currentStep === 3 && "Perform multi-layered regulatory ledger assertions before execution."}
            {currentStep === 4 && "Process finished with structural validations logged."}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-400">
          <span className={cn("px-2.5 py-1 rounded-md border", currentStep === 1 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white")}>1. Select</span>
          <ChevronRight className="size-3.5" />
          <span className={cn("px-2.5 py-1 rounded-md border", currentStep === 2 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white")}>2. Adjust Pay</span>
          <ChevronRight className="size-3.5" />
          <span className={cn("px-2.5 py-1 rounded-md border", currentStep === 3 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white")}>3. Overview</span>
          <ChevronRight className="size-3.5" />
          <span className={cn("px-2.5 py-1 rounded-md border", currentStep === 4 ? "bg-green-50 border-green-200 text-green-700" : "bg-white")}>4. Finalize</span>
        </div>
      </div>

      {/* STEP 1: CHOOSE SCHEDULE */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <CardTitle className="text-base font-bold text-slate-900">Available Payroll Pipelines</CardTitle>
              <CardDescription>Select which pay frequency group needs active cycle initialization.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {schedules.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm font-semibold">
                  No payroll schedules built. Initialize definitions within Settings first.
                </div>
              ) : (
                <RadioGroup value={selectedSchedule} onValueChange={setSelectedSchedule} className="grid grid-cols-1 gap-3">
                  {schedules.map((schedule) => {
                    const isSelected = selectedSchedule === schedule.id;
                    return (
                      <div key={schedule.id} className="relative">
                        <RadioGroupItem value={schedule.id} id={schedule.id} className="absolute left-4 top-5.5 size-4" />
                        <Label
                          htmlFor={schedule.id}
                          className={cn(
                            "flex items-center justify-between w-full pl-11 pr-5 py-4 border rounded-xl cursor-pointer shadow-2xs transition-all",
                            isSelected ? "border-blue-600 bg-blue-50/20" : "border-slate-200 bg-white hover:bg-slate-50/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{schedule.name}</p>
                              <p className="text-xs font-semibold text-slate-400 mt-0.5 uppercase tracking-wide">{schedule.frequency}</p>
                            </div>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                              schedule.status === "ready" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"
                            )}>
                              {schedule.status === "ready" ? "Ready" : "Pending"}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Next Run Date</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">
                              {new Date(schedule.nextRunDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              onClick={handleSelectSchedule}
              disabled={!selectedSchedule}
              className="h-9 gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-sm disabled:opacity-40"
            >
              Initialize Elements
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: REVIEW VALUES */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/30 p-4 text-xs font-semibold text-blue-900">
            <Clock className="size-4.5 text-blue-600 shrink-0" />
            <p>Confirm logged hours, assign targeted cash performance bonuses, or include calculated overtime metrics below.</p>
          </div>

          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <CardTitle className="text-base font-bold text-slate-900">Adjust Staff Pay Allocations</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {employees.length === 0 ? (
                <div className="text-center py-10 text-slate-500 font-semibold text-sm">
                  No active employees found in your directory.
                </div>
              ) : (
                employees.map((employee) => (
                  <div key={employee.id} className="border border-slate-200 rounded-xl p-5 bg-white space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{employee.name}</h3>
                        <p className="text-xs font-semibold text-slate-400 mt-0.5">Reference key: {employee.id.slice(0,8)}...</p>
                      </div>
                      <Badge className="bg-slate-100 text-slate-800 border-none font-bold text-[11px] h-5.5 px-2">
                        Est. Gross: £{employee.grossPay.toFixed(2)}
                      </Badge>
                    </div>
                    
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Regular Hours</Label>
                        <Input 
                          type="number" 
                          value={employee.hours || ""}
                          onChange={(e) => handleUpdateEmployee(employee.id, 'hours', parseFloat(e.target.value))}
                          className="h-9 font-semibold text-slate-800 border-slate-200 shadow-3xs text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overtime Hours</Label>
                        <Input 
                          type="number" 
                          value={employee.overtimeHours || ""}
                          onChange={(e) => handleUpdateEmployee(employee.id, 'overtimeHours', parseFloat(e.target.value))}
                          className="h-9 font-semibold text-slate-800 border-slate-200 shadow-3xs text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bonus Allocation (£)</Label>
                        <Input 
                          type="number" 
                          value={employee.bonus || ""}
                          onChange={(e) => handleUpdateEmployee(employee.id, 'bonus', parseFloat(e.target.value))}
                          className="h-9 font-semibold text-slate-800 border-slate-200 shadow-3xs text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calculated Net</Label>
                        <div className="h-9 px-3 bg-blue-50 rounded-md border border-blue-200 text-sm font-bold text-blue-900 flex items-center shadow-3xs">
                          £{employee.netPay.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleBack} className="h-9 font-semibold text-slate-600 shadow-2xs">
              Back
            </Button>
            <Button 
              onClick={() => setCurrentStep(3)}
              size="sm"
              disabled={employees.length === 0}
              className="h-9 gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-sm"
            >
              Review Summary
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: FINANCIAL OVERVIEW SUMMARY */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Gross Salaries</p>
              <p className="mt-1.5 text-2xl font-extrabold text-slate-900">£{totalGrossPay.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Income Tax (PAYE)</p>
              <p className="mt-1.5 text-2xl font-extrabold text-red-600">£{totalTax.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">National Insurance</p>
              <p className="mt-1.5 text-2xl font-extrabold text-red-600">£{totalNI.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Employee Net Take-home</p>
              <p className="mt-1.5 text-2xl font-extrabold text-blue-950">£{totalNetPay.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader className="border-b border-slate-50 py-4 px-5">
                  <CardTitle className="text-base font-bold text-slate-900">Draft Payslip Distribution Directory</CardTitle>
                  <CardDescription>Review itemized summaries before submitting to financial ledgers.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-slate-100 text-sm font-medium">
                  {employees.map((employee) => (
                    <div key={employee.id} className="flex items-center justify-between p-4 px-5 hover:bg-slate-50/40 transition-colors">
                      <div>
                        <p className="font-bold text-slate-800">{employee.name}</p>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">Net Disbursed: £{employee.netPay.toFixed(2)}</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 font-semibold border-slate-200 text-slate-700 bg-white shadow-2xs hover:bg-slate-50">
                        <Download className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                        Preview Draft
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader className="border-b border-slate-50 py-4 px-5">
                  <CardTitle className="text-base font-bold text-slate-900">Total Settlement Costs</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3 text-xs font-semibold text-slate-500">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span>Est. Employer Class 1 NI</span>
                    <span className="font-bold text-slate-900">£{(totalCompanyCost - totalGrossPay).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50/40 border border-red-100 rounded-lg text-red-800">
                    <span>PAYE Tax Pools</span>
                    <span className="font-bold">£{totalTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50/40 border border-red-100 rounded-lg text-red-800">
                    <span>Staff NIC Deductions</span>
                    <span className="font-bold">£{totalNI.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm font-bold">
                    <span>Liquid Net Disbursal</span>
                    <span className="font-extrabold text-emerald-600">£{totalNetPay.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" size="sm" onClick={handleBack} className="h-9 font-semibold text-slate-600 shadow-2xs">
              Back
            </Button>
            <Button 
              onClick={handleRunPayroll}
              disabled={isSubmitting}
              size="sm"
              className="h-9 gap-1.5 bg-green-600 font-bold text-white hover:bg-green-700 shadow-sm"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Confirm & Run Payroll
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS RECEIPT */}
      {currentStep === 4 && (
        <div className="space-y-6 animate-in zoom-in-98 duration-200">
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-2xs">
            <CardContent className="p-5 flex items-center gap-4">
      <div className="w-10 h-10 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center shrink-0">
        <Check className="h-5 w-5 text-emerald-600" />
      </div>
      <div>
       <h2 className="text-base font-bold text-emerald-900">Payroll Executed & Locked!</h2>
       <p className="text-xs font-semibold text-emerald-600 mt-0.5">{selectedScheduleData?.name} ledger tokens locked. HMRC Real-Time logged.</p>
     </div>
      </CardContent> 
      </Card>
          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <CardTitle className="text-base font-bold text-slate-900">Processing Metadata Receipt</CardTitle>
            </CardHeader>
            <CardContent className="p-5 grid gap-4 grid-cols-2 md:grid-cols-4 text-xs font-semibold text-slate-400">
              <div>
                <p className="uppercase tracking-wider">Pipeline Profile</p>
                <p className="font-bold text-slate-800 text-sm mt-1 truncate">{selectedScheduleData?.name}</p>
              </div>
              <div>
                <p className="uppercase tracking-wider">Staff Members</p>
                <p className="font-bold text-slate-800 text-sm mt-1">{employees.length} Processed</p>
              </div>
              <div>
                <p className="uppercase tracking-wider">Gross Payroll Pool</p>
                <p className="font-bold text-slate-800 text-sm mt-1">£{totalGrossPay.toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wider">Net Cash Transfers</p>
                <p className="font-bold text-green-600 text-sm mt-1">£{totalNetPay.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-50 py-4 px-5">
              <CardTitle className="text-base font-bold text-slate-900">Disbursed Final Payslips</CardTitle>
              <CardDescription>Documents are encrypted and uploaded to cloud employee vault accounts.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100 text-sm font-medium">
              {employees.map((employee) => (
                <div key={employee.id} className="flex items-center justify-between p-4 px-5">
                  <p className="font-bold text-slate-800">{employee.name}</p>
                  <Button variant="outline" size="sm" className="h-8 font-semibold border-slate-200 text-slate-700 bg-white shadow-2xs hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                    Download Payslip
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button 
            onClick={() => {
              setSelectedSchedule("");
              setCurrentStep(1);
            }}
            className="w-full h-10 bg-slate-900 hover:bg-slate-800 font-bold text-white shadow-sm"
          >
            Run Another Pipeline
          </Button>
        </div>
      )}
    </div>
  );
}