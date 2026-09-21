"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Calendar,
  Users,
  PoundSterling,
  Clock,
  TrendingUp,
  PieChart,
  Building2,
  Receipt,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Loader2, // ✅ Added loader for fetching state
} from "lucide-react";

import { getPayrollSummaryReport, generateP60Report, type PayrollReportRow } from "@/app/(dashboard)/payroll/actions";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

const reportTypes: ReportType[] = [
  // Payroll Reports
  {
    id: "payroll-summary",
    name: "Payroll Summary Report",
    description: "Overview of total payroll costs, deductions, and net pay by period",
    icon: <PoundSterling className="h-4 w-4" />,
    category: "Payroll",
  },
  {
    id: "payslip-report",
    name: "Payslip Detail Report",
    description: "Detailed breakdown of all payslips with earnings, deductions, and taxes",
    icon: <Receipt className="h-4 w-4" />,
    category: "Payroll",
  },
  {
    id: "payment-history",
    name: "Payment History Report",
    description: "Historical record of all payroll payments and bank transfers",
    icon: <FileText className="h-4 w-4" />,
    category: "Payroll",
  },
  // Employee Reports
  {
    id: "employee-list",
    name: "Employee Directory Report",
    description: "Complete list of all employees with contact and employment details",
    icon: <Users className="h-4 w-4" />,
    category: "Employee",
  },
  {
    id: "employee-summary",
    name: "Employee Summary Report",
    description: "Summary statistics on active, inactive, and new employees",
    icon: <PieChart className="h-4 w-4" />,
    category: "Employee",
  },
  {
    id: "new-hires",
    name: "New Hires Report",
    description: "List of recently hired employees with start dates and onboarding status",
    icon: <Users className="h-4 w-4" />,
    category: "Employee",
  },
  {
    id: "terminations",
    name: "Terminations Report",
    description: "Record of employee departures with dates and reasons",
    icon: <Users className="h-4 w-4" />,
    category: "Employee",
  },
  // Time & Attendance Reports
  {
    id: "timesheet-summary",
    name: "Timesheet Summary Report",
    description: "Summary of hours worked, overtime, and attendance by employee",
    icon: <Clock className="h-4 w-4" />,
    category: "Time & Attendance",
  },
  {
    id: "time-clock-report",
    name: "Time Clock Report",
    description: "Detailed clock in/out times with breaks and attendance status",
    icon: <Clock className="h-4 w-4" />,
    category: "Time & Attendance",
  },
  {
    id: "overtime-report",
    name: "Overtime Report",
    description: "Analysis of overtime hours worked and associated costs",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "Time & Attendance",
  },
  {
    id: "absence-report",
    name: "Absence & Leave Report",
    description: "Record of sick leave, annual leave, and other absences",
    icon: <Calendar className="h-4 w-4" />,
    category: "Time & Attendance",
  },
  {
    id: "leave-balance",
    name: "Leave Balance Report",
    description: "Current leave balances for all employees by type",
    icon: <Calendar className="h-4 w-4" />,
    category: "Time & Attendance",
  },
  // Tax & Compliance Reports
  {
    id: "tax-report",
    name: "Tax Deductions Report",
    description: "Summary of income tax, NI contributions, and other deductions",
    icon: <FileText className="h-4 w-4" />,
    category: "Tax & Compliance",
  },
  {
    id: "pension-report",
    name: "Pension Contributions Report",
    description: "Employee and employer pension contributions summary",
    icon: <Building2 className="h-4 w-4" />,
    category: "Tax & Compliance",
  },
  {
    id: "p11d-report",
    name: "P11D Benefits Report",
    description: "Reportable benefits and expenses for tax year end",
    icon: <FileText className="h-4 w-4" />,
    category: "Tax & Compliance",
  },
  {
    id: "fps-report",
    name: "Full Payment Submission (FPS)",
    description: "RTI submission report for HMRC compliance",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    category: "Tax & Compliance",
  },
  // Cost & Analysis Reports
  {
    id: "department-cost",
    name: "Department Cost Report",
    description: "Payroll costs broken down by department or cost centre",
    icon: <Building2 className="h-4 w-4" />,
    category: "Cost & Analysis",
  },
  {
    id: "salary-analysis",
    name: "Salary Analysis Report",
    description: "Salary distribution, averages, and benchmarking data",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "Cost & Analysis",
  },
  {
    id: "ytd-summary",
    name: "Year-to-Date Summary",
    description: "Cumulative payroll data from start of tax year",
    icon: <Calendar className="h-4 w-4" />,
    category: "Cost & Analysis",
  },
  {
    id: "cost-projections",
    name: "Payroll Cost Projections",
    description: "Forecasted payroll costs based on current data and trends",
    icon: <TrendingUp className="h-4 w-4" />,
    category: "Cost & Analysis",
  },
  // Benefits Reports
  {
    id: "benefits-summary",
    name: "Benefits Summary Report",
    description: "Overview of all employee benefits and enrollments",
    icon: <PieChart className="h-4 w-4" />,
    category: "Benefits",
  },
  {
    id: "benefits-cost",
    name: "Benefits Cost Report",
    description: "Cost analysis of employer-provided benefits",
    icon: <PoundSterling className="h-4 w-4" />,
    category: "Benefits",
  },
];

export function PayrollReportsUI() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("current-month");
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Payroll");

  // ✅ New State variables for the Live Preview Table
  const [previewData, setPreviewData] = useState<PayrollReportRow[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  // ✅ Load the Preview Table Data on mount!
  useEffect(() => {
    async function loadPreviewData() {
      try {
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);

        // Fetch actual data from your database!
        const data = await getPayrollSummaryReport(
          sixMonthsAgo.toISOString().split("T")[0],
          now.toISOString().split("T")[0]
        );

        // Slice to just the top 5 to keep the table clean
        setPreviewData(data.slice(0, 5));
      } catch (err) {
        toast.error("Failed to load historical preview data");
      } finally {
        setIsLoadingPreview(false);
      }
    }
    loadPreviewData();
  }, []);

  const categories = ["all", "Payroll", "Employee", "Time & Attendance", "Tax & Compliance", "Cost & Analysis", "Benefits"];

  const filteredReports = reportTypes.filter((report) => {
    const matchesCategory = selectedCategory === "all" || report.category === selectedCategory;
    const matchesSearch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          report.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const groupedReports = categories.slice(1).reduce((acc, category) => {
    acc[category] = filteredReports.filter((r) => r.category === category);
    return acc;
  }, {} as Record<string, ReportType[]>);

  const handleGenerateReport = async (reportName: string) => {
    try {
      if (reportName === "P60 Report") {
        const currentYear = new Date().getFullYear() - 1;
        const data = await generateP60Report(currentYear);
        if (data.length === 0) {
          toast.info("No P60 data found for this tax year");
        } else {
          toast.success(`Generated P60 report for ${data.length} employees`);
        }
      } else if (reportName === "Payroll Summary Report") {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
        const endOfYear = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
        const data = await getPayrollSummaryReport(startOfYear, endOfYear);
        if (data.length === 0) {
          toast.info("No payroll data found for this period");
        } else {
          toast.success(`Generated payroll summary with ${data.length} payroll runs`);
        }
      } else {
        toast.success(`Generating ${reportName}...`);
      }
    } catch (err) {
      toast.error(`Failed to generate ${reportName}`);
    }
  };

  const handleDownload = (format: string) => {
    toast.success(`Report downloaded as ${format.toUpperCase()}`, {
      description: "File saved to your downloads folder",
    });
  };

  return (
    <div className="w-full space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payroll Reports</h1>
        <p className="text-sm text-slate-500">Generate and download comprehensive payroll compliance ledger reports.</p>
      </div>

      {/* FILTERS */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Search Reports</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 border-slate-200 focus-visible:ring-blue-500 text-sm font-medium shadow-2xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px] h-9 border-slate-200 text-sm font-medium shadow-2xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Payroll">Payroll</SelectItem>
                  <SelectItem value="Employee">Employee</SelectItem>
                  <SelectItem value="Time & Attendance">Time & Attendance</SelectItem>
                  <SelectItem value="Tax & Compliance">Tax & Compliance</SelectItem>
                  <SelectItem value="Cost & Analysis">Cost & Analysis</SelectItem>
                  <SelectItem value="Benefits">Benefits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[180px] h-9 border-slate-200 text-sm font-medium shadow-2xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                  <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="last-year">Last Tax Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="h-9 gap-1.5 font-semibold text-slate-700 border-slate-200 shadow-2xs hover:bg-slate-50 cursor-pointer">
              <Filter className="h-4 w-4 text-slate-400" />
              More Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QUICK STATS */}
      <div className="grid gap-4 grid-cols-1 min-[500px]:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Reports</CardTitle>
            <FileText className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{reportTypes.length}</div>
            <p className="text-xs text-slate-400 mt-0.5">Available system indices</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Generated This Month</CardTitle>
            <Download className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">47</div>
            <p className="text-xs text-emerald-600 font-medium mt-0.5">+12 accumulated volume</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Scheduled Reports</CardTitle>
            <Calendar className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">8</div>
            <p className="text-xs text-slate-400 mt-0.5">Auto-generated intervals</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Generated</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">2 hrs ago</div>
            <p className="text-xs text-slate-500 mt-0.5 truncate font-medium">Payroll Summary Report</p>
          </CardContent>
        </Card>
      </div>

      {/* REPORTS BY CATEGORY */}
      <div className="space-y-4">
        {Object.entries(groupedReports).map(([category, reports]) => {
          if (reports.length === 0) return null;
          const isExpanded = expandedCategory === category || selectedCategory !== "all";
          
          return (
            <Card key={category} className="shadow-sm overflow-hidden border-slate-200">
              <CardHeader 
                className="cursor-pointer bg-slate-50/40 border-b border-slate-100 hover:bg-slate-50/80 transition-colors py-4 px-5"
                onClick={() => setExpandedCategory(isExpanded ? null : category)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-slate-900">{category}</CardTitle>
                    <Badge variant="secondary" className="bg-slate-200/60 text-slate-700 border-none font-bold text-[11px] h-5 px-1.5">{reports.length}</Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="p-5">
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {reports.map((report) => (
                      <Card 
                        key={report.id} 
                        className="border border-slate-200 hover:border-blue-300 shadow-2xs transition-all cursor-pointer group flex flex-col justify-between"
                        onClick={() => handleGenerateReport(report.name)}
                      >
                        <CardContent className="p-4 flex flex-col justify-between h-full">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-100/70 transition-colors shrink-0">
                              {report.icon}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-700 transition-colors">{report.name}</h3>
                              <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed line-clamp-2">{report.description}</p>
                            </div>
                          </div>
                          
                          <div className="flex gap-1 mt-4 pt-3 border-t border-slate-50 text-[11px] font-bold text-slate-500">
                            <button 
                              className="flex-1 h-7 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload("pdf");
                              }}
                            >
                              <FileText className="h-3 w-3 text-slate-400" />
                              PDF
                            </button>
                            <div className="w-[1px] h-4 bg-slate-100 self-center" />
                            <button 
                              className="flex-1 h-7 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload("excel");
                              }}
                            >
                              <FileSpreadsheet className="h-3 w-3 text-slate-400" />
                              Excel
                            </button>
                            <div className="w-[1px] h-4 bg-slate-100 self-center" />
                            <button 
                              className="flex-1 h-7 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload("csv");
                              }}
                            >
                              <Download className="h-3 w-3 text-slate-400" />
                              CSV
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* DATA PREVIEW TABLE */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Payroll Summary Preview</CardTitle>
              <CardDescription>Historical ledger data from the past 5 active reporting periods</CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => handleDownload("excel")} className="h-8 font-semibold border-slate-200 shadow-2xs text-slate-700 bg-white hover:bg-slate-50">
                <FileSpreadsheet className="h-4 w-4 mr-1.5 text-slate-500" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownload("pdf")} className="h-8 font-semibold border-slate-200 shadow-2xs text-slate-700 bg-white hover:bg-slate-50">
                <Printer className="h-4 w-4 mr-1.5 text-slate-500" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 pl-5">Period</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Employees</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Gross Pay</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Deductions</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3">Taxes</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-3 text-right pr-5">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm font-medium text-slate-700 divide-y divide-slate-100">
                
                {isLoadingPreview ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <div className="flex items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        Fetching historical ledger data...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : previewData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                      No recent payroll runs discovered in the ledger.
                    </TableCell>
                  </TableRow>
                ) : (
                  previewData.map((row) => {
                    const totalDeductions = row.tax + row.nationalInsurance + row.pension;
                    
                    // Format period from YYYY-MM to MMM YYYY (e.g., Nov 2024)
                    const dateObj = new Date(row.period + "-01");
                    const displayPeriod = dateObj.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
                    
                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50/40 transition-colors">
                        <TableCell className="font-bold text-slate-900 py-3.5 pl-5">{displayPeriod}</TableCell>
                        <TableCell className="text-slate-500">{row.employeeCount}</TableCell>
                        <TableCell>£{row.grossPay.toLocaleString("en-GB", {minimumFractionDigits: 2})}</TableCell>
                        <TableCell className="text-slate-500">£{totalDeductions.toLocaleString("en-GB", {minimumFractionDigits: 2})}</TableCell>
                        <TableCell className="text-slate-500">£{row.tax.toLocaleString("en-GB", {minimumFractionDigits: 2})}</TableCell>
                        <TableCell className="text-right font-bold text-slate-900 py-3.5 pr-5">£{row.netPay.toLocaleString("en-GB", {minimumFractionDigits: 2})}</TableCell>
                      </TableRow>
                    );
                  })
                )}
                
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* FOOTER METRIC ANCHOR */}
      <Card className="bg-blue-50/40 border-blue-200/70 shadow-2xs">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-blue-900 text-sm">Report Scheduling</p>
              <p className="text-xs text-blue-700 mt-1 leading-relaxed font-medium">
                You can configure any report framework to run automatically and dispatch emails at custom intervals (daily, weekly, or monthly). 
                Go to <strong className="text-blue-900 font-bold">Settings &gt; Report Schedules</strong> to structure delivery configurations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}