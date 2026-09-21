"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  User,
  ChevronRight,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  PoundSterling,
  MapPin,
  Shield,
} from "lucide-react";
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
import { getEmployees, createEmployee } from "../actions";
import { contactDisplayName } from "@/lib/accounting/contact-name";

// Map DB Employee status to UI status
function mapEmployeeStatus(status: string): "active" | "inactive" | "on-leave" {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "TERMINATED":
      return "inactive";
    case "ON_LEAVE":
      return "on-leave";
    default:
      return "active";
  }
}

// Convert DB employee to UI format
function toUIEmployee(dbEmployee: {
  id: string;
  employeeCode: string;
  startDate: string;
  jobTitle: string | null;
  department: string | null;
  status: string;
  salaryAmountMinor: number;
  salaryFrequency: string;
  taxCode: string;
  nationalInsuranceNo: string | null;
  contact: {
    name: string;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name_preference?: string | null;
  } | null;
}): Employee {
  return {
    id: dbEmployee.id,
    name: dbEmployee.contact ? contactDisplayName(dbEmployee.contact) : "Unknown employee",
    email: dbEmployee.contact?.email ?? "",
    phone: "",
    department: dbEmployee.department ?? "Unassigned",
    position: dbEmployee.jobTitle ?? "—",
    startDate: dbEmployee.startDate.slice(0, 10),
    status: mapEmployeeStatus(dbEmployee.status),
    payrollSchedule:
      dbEmployee.salaryFrequency === "annual" ? "Monthly" : dbEmployee.salaryFrequency,
    salary: `£${(Number(dbEmployee.salaryAmountMinor) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`,
    address: "",
    nationalInsurance: dbEmployee.nationalInsuranceNo ?? "—",
    taxCode: dbEmployee.taxCode,
  };
}

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  startDate: string;
  status: "active" | "inactive" | "on-leave";
  payrollSchedule: string;
  salary: string;
  address: string;
  nationalInsurance: string;
  taxCode: string;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [salaryType, setSalaryType] = useState<"fixed" | "hourly">("fixed");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Add employee form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    position: "",
    startDate: "",
    salaryAmount: "",
    niNumber: "",
    taxCode: "1257L",
    payrollSchedule: "monthly",
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await getEmployees();
        setEmployees(data.map(toUIEmployee));
      } catch {
        toast.error("Failed to load employees");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      case "on-leave":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
          <p className="text-slate-600">Manage employee profiles and payroll information</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {/* Search and Stats */}
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            {employees.length} Total
          </Badge>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            {employees.filter((e) => e.status === "active").length} Active
          </Badge>
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            {employees.filter((e) => e.status === "on-leave").length} On Leave
          </Badge>
        </div>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
          <CardDescription>
            Click on an employee to view their full profile and payroll history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Payroll Schedule</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Loading employees...
                  </TableCell>
                </TableRow>
              ) : filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    {searchTerm
                      ? "No employees match your search"
                      : "No employees found. Add your first employee."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((employee) => (
                  <TableRow
                    key={employee.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/payroll/employees/${employee.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium">{employee.name}</div>
                          <div className="text-sm text-slate-600">{employee.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{employee.department}</TableCell>
                    <TableCell>{employee.position}</TableCell>
                    <TableCell>{employee.payrollSchedule}</TableCell>
                    <TableCell>{employee.salary}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(employee.status)}>{employee.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Employee Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              Enter the employee details below to add them to the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" /> First Name
                </label>
                <Input
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" /> Last Name
                </label>
                <Input
                  placeholder="Smith"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email
              </label>
              <Input
                type="email"
                placeholder="john.smith@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" /> Phone
              </label>
              <Input
                placeholder="+44 20 7123 4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Address
              </label>
              <div className="space-y-2">
                <Input placeholder="Address Line 1" />
                <Input placeholder="Address Line 2 (Optional)" />
                <Input placeholder="Address Line 3 (Optional)" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input placeholder="Borough / City" />
                  <Input placeholder="Post Code" />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Department
                </label>
                <Select
                  value={formData.department}
                  onValueChange={(v) => setFormData({ ...formData, department: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Position
                </label>
                <Input
                  placeholder="e.g., Senior Developer"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Start Date
                </label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Salary Type</label>
                <Select
                  value={salaryType}
                  onValueChange={(v) => setSalaryType(v as "fixed" | "hourly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                    <SelectItem value="hourly">Hourly Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Salary Details - Conditional */}
            {salaryType === "fixed" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <PoundSterling className="h-4 w-4" /> Annual Salary
                </label>
                <Input
                  placeholder="e.g., 50000"
                  value={formData.salaryAmount}
                  onChange={(e) => setFormData({ ...formData, salaryAmount: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-700">Hourly Rate Details</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">Hourly Rate</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        £
                      </span>
                      <Input className="pl-7" placeholder="15.00" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">Tentative Fixed Hours/Week</label>
                    <Input placeholder="e.g., 40" />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Estimated annual: £<span className="font-medium">31,200</span> (based on 40
                  hrs/week × 52 weeks)
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" /> NI Number
                </label>
                <Input
                  placeholder="AB123456C"
                  value={formData.niNumber}
                  onChange={(e) => setFormData({ ...formData, niNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tax Code</label>
                <Input
                  placeholder="1257L"
                  value={formData.taxCode}
                  onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Payroll Schedule</label>
              <Select
                value={formData.payrollSchedule}
                onValueChange={(v) => setFormData({ ...formData, payrollSchedule: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={isPending}
              onClick={() => {
                if (
                  !formData.firstName ||
                  !formData.lastName ||
                  !formData.email ||
                  !formData.salaryAmount
                ) {
                  toast.error("Please fill in all required fields");
                  return;
                }
                startTransition(async () => {
                  try {
                    await createEmployee({
                      name: `${formData.firstName} ${formData.lastName}`.trim(),
                      email: formData.email,
                      phone: formData.phone,
                      employeeCode: `EMP-${Date.now()}`,
                      startDate: formData.startDate || new Date().toISOString().slice(0, 10),
                      jobTitle: formData.position,
                      department: formData.department,
                      salaryAmountMinor: Math.round(parseFloat(formData.salaryAmount) * 100),
                      salaryFrequency: formData.payrollSchedule,
                      taxCode: formData.taxCode,
                      nationalInsuranceNo: formData.niNumber || undefined,
                    });
                    toast.success("Employee added successfully");
                    setShowAddDialog(false);
                    // Reload employees
                    const data = await getEmployees();
                    setEmployees(data.map(toUIEmployee));
                  } catch {
                    toast.error("Failed to add employee");
                  }
                });
              }}
            >
              {isPending ? "Adding..." : "Add Employee"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
