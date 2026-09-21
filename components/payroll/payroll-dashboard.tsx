import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Clock, 
  Calendar, 
  TrendingUp, 
  AlertCircle,
  CreditCard,
  Settings,
  ArrowRight // ✅ Added for the Quick Actions
} from "lucide-react";
import { getPayrollDashboardData } from "@/app/(dashboard)/payroll/actions";

export async function PayrollDashboard() {
  const data = await getPayrollDashboardData().catch(() => null);

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Payroll Dashboard</h1>
            <p className="text-slate-600">Overview of your payroll operations and metrics</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Loading payroll data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Payroll Dashboard</h1>
          <p className="text-slate-600">Overview of your payroll operations and metrics</p>
        </div>
        <Button 
          asChild
          className="bg-blue-600 hover:bg-blue-700 font-semibold shadow-sm"
        >
          <Link href="/payroll/run-payroll">Run Payroll</Link>
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.activeEmployees}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.activeEmployees > 0 ? "On payroll system" : "No employees yet"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Next Payroll</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {data.daysUntilNextPay ?? "--"} days
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Monthly schedule</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Monthly Payroll Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              £{(data.monthlyCost / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Total monthly net pay</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Timesheets</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{data.pendingTimesheets}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.pendingTimesheets === 1 ? "Requires approval" : "Require approval"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Split: Recent Activity (Left) & Alerts (Right) */}
      <div className="grid gap-6 lg:grid-cols-2 items-stretch">
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-slate-900 font-bold">Recent Payroll Runs</CardTitle>
            <CardDescription>Latest payroll processing history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            {data.recentPayrollRuns.length === 0 ? (
              <p className="text-sm text-slate-500">No payroll runs yet. Create your first payroll run.</p>
            ) : (
              data.recentPayrollRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      run.status === "COMPLETED" ? "bg-green-500" : 
                      run.status === "PROCESSING" ? "bg-blue-500" :
                      run.status === "PENDING" ? "bg-yellow-500" : "bg-red-500"
                    }`}></div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{run.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span>{run.employeeCount} employees</span>
                        <span className="size-1 rounded-full bg-slate-300"></span>
                        <span>{new Date(run.payDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-sm font-bold text-slate-900">
                      £{(run.totalNet / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </span>
                    <Badge variant={
                      run.status === "COMPLETED" ? "secondary" : 
                      run.status === "PROCESSING" ? "default" :
                      run.status === "PENDING" ? "outline" : "destructive"
                    } className="text-[9px] font-bold tracking-wider">
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Alerts Section (Moved here to balance the layout) */}
        <Card className="shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-slate-900 font-bold">Alerts & Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex-1">
            <div className="flex items-center space-x-3 p-3.5 bg-amber-50/50 border border-amber-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold text-amber-900 text-sm">3 Timesheets Pending</p>
                <p className="text-xs text-amber-700 mt-0.5">Require accountant evaluation before next payroll window locks.</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3.5 bg-blue-50/50 border border-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <p className="font-bold text-blue-900 text-sm">Payroll Deadline Approaching</p>
                <p className="text-xs text-blue-700 mt-0.5">Monthly payroll and FPS compliance sheets due in 5 days.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── SECTION: Premium Quick Actions (Absolute Bottom) ─── */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4 tracking-tight">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/payroll/employees" className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
              <Users className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Add Employee</h3>
              <p className="mt-1 text-xs text-slate-500">Create a new team member</p>
            </div>
            <ArrowRight className="absolute bottom-5 right-5 size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
          </Link>

          <Link href="/payroll/timesheets" className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
              <Clock className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Timesheets</h3>
              <p className="mt-1 text-xs text-slate-500">Review and approve hours</p>
            </div>
            <ArrowRight className="absolute bottom-5 right-5 size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-600" />
          </Link>

          <Link href="/payroll/run-payroll" className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow-md transition-all">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600 transition-colors group-hover:bg-orange-600 group-hover:text-white">
              <CreditCard className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Run Payroll</h3>
              <p className="mt-1 text-xs text-slate-500">Process the next pay run</p>
            </div>
            <ArrowRight className="absolute bottom-5 right-5 size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-orange-600" />
          </Link>

          <Link href="/payroll/settings" className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-purple-300 hover:shadow-md transition-all">
            <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
              <Settings className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Settings</h3>
              <p className="mt-1 text-xs text-slate-500">Manage payroll config</p>
            </div>
            <ArrowRight className="absolute bottom-5 right-5 size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-purple-600" />
          </Link>
        </div>
      </div>
    </div>
  );
}