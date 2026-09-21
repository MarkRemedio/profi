"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Eye,
  DollarSign,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  Search,
  Printer,
  ChevronDown,
  Filter,
  PiggyBank,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface EmployeePayslip {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  grossPay: number;
  incomeTax: number;
  niContribution: number;
  pensionContribution: number;
  otherDeductions: number;
  netPay: number;
  status: "paid" | "pending" | "processing";
}

const employeePayslips: EmployeePayslip[] = [
  { id: "1", employeeId: "EMP-001", name: "Alice Johnson", department: "Engineering", grossPay: 55000, incomeTax: 8200, niContribution: 5100, pensionContribution: 2200, otherDeductions: 500, netPay: 39000, status: "paid" },
  { id: "2", employeeId: "EMP-002", name: "Bob Smith", department: "Engineering", grossPay: 62000, incomeTax: 10500, niContribution: 5800, pensionContribution: 2480, otherDeductions: 0, netPay: 43220, status: "paid" },
  { id: "3", employeeId: "EMP-003", name: "Carol White", department: "Marketing", grossPay: 48000, incomeTax: 6200, niContribution: 4100, pensionContribution: 1920, otherDeductions: 300, netPay: 35480, status: "paid" },
  { id: "4", employeeId: "EMP-004", name: "David Brown", department: "Sales", grossPay: 45000, incomeTax: 5400, niContribution: 3800, pensionContribution: 1800, otherDeductions: 200, netPay: 33800, status: "pending" },
  { id: "5", employeeId: "EMP-005", name: "Emma Davis", department: "HR", grossPay: 52000, incomeTax: 7800, niContribution: 4800, pensionContribution: 2080, otherDeductions: 0, netPay: 37320, status: "paid" },
  { id: "6", employeeId: "EMP-006", name: "Frank Wilson", department: "Finance", grossPay: 58000, incomeTax: 9200, niContribution: 5300, pensionContribution: 2320, otherDeductions: 400, netPay: 40780, status: "paid" },
  { id: "7", employeeId: "EMP-007", name: "Grace Lee", department: "Operations", grossPay: 42000, incomeTax: 4800, niContribution: 3500, pensionContribution: 1680, otherDeductions: 150, netPay: 31870, status: "processing" },
  { id: "8", employeeId: "EMP-008", name: "Henry Taylor", department: "Engineering", grossPay: 65000, incomeTax: 11800, niContribution: 6200, pensionContribution: 2600, otherDeductions: 500, netPay: 44900, status: "paid" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function Payslips() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("nov-2024");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeePayslip | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const filteredPayslips = employeePayslips.filter((payslip) => {
    const matchesSearch = payslip.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payslip.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === "all" || payslip.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const departments = [...new Set(employeePayslips.map((p) => p.department))];

  const totals = filteredPayslips.reduce(
    (acc, curr) => ({
      grossPay: acc.grossPay + curr.grossPay,
      incomeTax: acc.incomeTax + curr.incomeTax,
      niContribution: acc.niContribution + curr.niContribution,
      pensionContribution: acc.pensionContribution + curr.pensionContribution,
      otherDeductions: acc.otherDeductions + curr.otherDeductions,
      netPay: acc.netPay + curr.netPay,
    }),
    { grossPay: 0, incomeTax: 0, niContribution: 0, pensionContribution: 0, otherDeductions: 0, netPay: 0 }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-700">Paid</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700">Pending</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-700">Processing</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payslip Preview</h1>
          <p className="text-sm text-slate-500">View and manage employee payslips for the selected period</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast.success("All payslips exported to Excel")}>
            <FileText className="h-4 w-4 mr-2" />
            Export All
          </Button>
          <Button variant="outline" onClick={() => toast.success("Payslips ready for printing")}>
            <Printer className="h-4 w-4 mr-2" />
            Print Batch
          </Button>
        </div>
      </div>

      {/* Period Selector & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Pay Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nov-2024">November 2024</SelectItem>
                  <SelectItem value="oct-2024">October 2024</SelectItem>
                  <SelectItem value="sep-2024">September 2024</SelectItem>
                  <SelectItem value="aug-2024">August 2024</SelectItem>
                  <SelectItem value="jul-2024">July 2024</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Search Employee</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              More Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredPayslips.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Pay</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.grossPay)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income Tax</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.incomeTax)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NI Contributions</CardTitle>
            <Building2 className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.niContribution)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pension</CardTitle>
            <PiggyBank className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.pensionContribution)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Pay</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totals.netPay)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Payslips Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Payslips - November 2024</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Gross Pay</TableHead>
                <TableHead className="text-right">Income Tax</TableHead>
                <TableHead className="text-right">NI</TableHead>
                <TableHead className="text-right">Pension</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayslips.map((payslip) => (
                <TableRow key={payslip.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="font-medium">{payslip.name}</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{payslip.employeeId}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{payslip.department}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(payslip.grossPay)}</TableCell>
                  <TableCell className="text-right text-red-600">-{formatCurrency(payslip.incomeTax)}</TableCell>
                  <TableCell className="text-right text-orange-600">-{formatCurrency(payslip.niContribution)}</TableCell>
                  <TableCell className="text-right text-purple-600">-{formatCurrency(payslip.pensionContribution)}</TableCell>
                  <TableCell className="text-right text-slate-600">
                    {payslip.otherDeductions > 0 ? `-${formatCurrency(payslip.otherDeductions)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-blue-600">{formatCurrency(payslip.netPay)}</TableCell>
                  <TableCell className="text-center">{getStatusBadge(payslip.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(payslip)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toast.success(`${payslip.name}'s payslip downloaded`)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Employee Payslip Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payslip Details</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.name} - November 2024
            </DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4 py-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee</span>
                  <span className="font-medium">{selectedEmployee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Employee ID</span>
                  <span className="font-medium">{selectedEmployee.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department</span>
                  <span className="font-medium">{selectedEmployee.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pay Period</span>
                  <span className="font-medium">November 2024</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm uppercase text-slate-500">Earnings</h4>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span>Basic Salary</span>
                  <span className="font-medium">{formatCurrency(selectedEmployee.grossPay)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold">
                  <span>Gross Total</span>
                  <span>{formatCurrency(selectedEmployee.grossPay)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm uppercase text-slate-500">Deductions</h4>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span>Income Tax</span>
                  <span className="font-medium text-red-600">-{formatCurrency(selectedEmployee.incomeTax)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span>National Insurance</span>
                  <span className="font-medium text-red-600">-{formatCurrency(selectedEmployee.niContribution)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span>Pension Contribution</span>
                  <span className="font-medium text-red-600">-{formatCurrency(selectedEmployee.pensionContribution)}</span>
                </div>
                {selectedEmployee.otherDeductions > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span>Other Deductions</span>
                    <span className="font-medium text-red-600">-{formatCurrency(selectedEmployee.otherDeductions)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 font-bold">
                  <span>Total Deductions</span>
                  <span className="text-red-600">
                    -{formatCurrency(selectedEmployee.incomeTax + selectedEmployee.niContribution + selectedEmployee.pensionContribution + selectedEmployee.otherDeductions)}
                  </span>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-green-800">Net Pay</span>
                  <span className="text-2xl font-bold text-green-700">{formatCurrency(selectedEmployee.netPay)}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => toast.success("Payslip sent to employee email")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Email Payslip
                </Button>
                <Button 
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => toast.success("Payslip downloaded as PDF")}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
