import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Download,
  ArrowLeft,
  Edit,
} from "lucide-react";

// ✅ Import your actual database tools!
import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { contactDisplayName } from "@/lib/accounting/contact-name";

const formatCurrency = (amountMinor: number) => {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amountMinor / 100);
};

// ✅ This is now a powerful Server Component
export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // 1. Get the requested ID and verify the user's workspace
  const resolvedParams = await params;
  const workspace = await requireAccountantRole();

  // 2. Fetch the REAL employee directly from your Supabase/Prisma database!
  const employee = await prisma.employee.findUnique({
    where: { 
      id: resolvedParams.id, 
      organizationId: workspace.organizationId 
    },
    include: {
      contact: true, // Pulls their name, email, phone from the contacts table
      payrollRunEmployees: {
        include: { payrollRun: true },
        orderBy: { payrollRun: { payDate: "desc" } }
      }
    }
  });

  if (!employee) {
    return (
      <div className="space-y-6">
        <Link href="/payroll/employees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600 font-medium">Employee not found in database.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "ACTIVE": return "bg-green-100 text-green-800";
      case "INACTIVE": return "bg-red-100 text-red-800";
      case "ON-LEAVE": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const payrollHistory = employee.payrollRunEmployees || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href="/payroll/employees">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Employees
          </Button>
        </Link>
      </div>

      {/* Employee Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">{employee.contact ? contactDisplayName(employee.contact) : "Unnamed Employee"}</h1>
                <p className="text-slate-600">{employee.jobTitle || "No Position Set"}</p>
                <Badge className={`mt-2 uppercase tracking-wider text-[10px] font-bold ${getStatusColor(employee.status)}`}>
                  {employee.status}
                </Badge>
              </div>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Edit className="mr-2 h-4 w-4" />
              Edit Employee
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employee Information */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{employee.contact?.email || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone</p>
                <p className="font-medium text-slate-900">{employee.contact?.phone || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Start Date</p>
                <p className="font-medium text-slate-900">
                  {new Date(employee.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Department</p>
              <p className="font-medium text-slate-900">{employee.department || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Employment Type</p>
              <p className="font-medium text-slate-900">{employee.employmentType.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Payroll Schedule</p>
              <p className="font-medium capitalize text-slate-900">{employee.salaryFrequency.toLowerCase()}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Salary</p>
              <p className="font-medium text-lg text-slate-900">{formatCurrency(Number(employee.salaryAmountMinor))}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tax & Statutory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">National Insurance Number</p>
              <p className="font-medium text-slate-900">{employee.nationalInsuranceNo || "Not Provided"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Tax Code</p>
              <p className="font-medium text-slate-900">{employee.taxCode}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Pension Status</p>
              <p className="font-medium text-slate-900">{employee.pensionEnrolled ? "Enrolled" : "Opted Out"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll History */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll History</CardTitle>
          <CardDescription>
            Recent payroll records and payslips for {employee.contact ? contactDisplayName(employee.contact) : undefined}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payrollHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Pay Date</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Gross Pay</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Tax</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">NI</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Net Pay</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Status</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">Payslip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollHistory.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium text-slate-900">
                      {new Date(record.payrollRun.payDate).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                    </TableCell>
                    <TableCell>{formatCurrency(Number(record.grossSalaryMinor))}</TableCell>
                    <TableCell>{formatCurrency(Number(record.taxMinor))}</TableCell>
                    <TableCell>{formatCurrency(Number(record.nationalInsuranceMinor))}</TableCell>
                    <TableCell className="font-bold text-emerald-600">
                      {formatCurrency(Number(record.netPayMinor))}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800 uppercase tracking-widest text-[9px]">
                        {record.payrollRun.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-8">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <FileText className="size-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800">No payroll records yet</p>
              <p className="text-xs text-slate-500 mt-1">This employee hasn't been included in a payroll run yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}