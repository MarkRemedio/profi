"use client";

import { useState } from "react";
import { Users, Plus, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeOnboardingDialog } from "@/components/payroll/employee-onboarding-dialog";

const sampleEmployees = [
  {
    id: "emp-1",
    name: "Aisha Khan",
    role: "Product Manager",
    status: "Active",
    salary: "£52,000",
    startDate: "2024-11-01",
    access: {
      payslips: true,
      documents: true,
      timeOff: true,
    },
  },
  {
    id: "emp-2",
    name: "Liam Chen",
    role: "Software Engineer",
    status: "Active",
    salary: "£48,000",
    startDate: "2025-02-14",
    access: {
      payslips: true,
      documents: false,
      timeOff: true,
    },
  },
  {
    id: "emp-3",
    name: "Maya Patel",
    role: "HR Specialist",
    status: "Active",
    salary: "£43,500",
    startDate: "2025-06-03",
    access: {
      payslips: true,
      documents: true,
      timeOff: false,
    },
  },
];

export function EmployeesView() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          Employees
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your team, contacts, and compensation details.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Employee information</h2>
            <p className="text-sm text-slate-500">View staff profiles, employment details, and onboarding status.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="size-4" />
            Onboard employee
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Salary</th>
                <th className="px-4 py-3 font-semibold">Start date</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
              {sampleEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{employee.name}</td>
                  <td className="px-4 py-3">{employee.role}</td>
                  <td className="px-4 py-3">{employee.salary}</td>
                  <td className="px-4 py-3">{employee.startDate}</td>
                  <td className="px-4 py-3 space-y-1 text-slate-700 text-xs">
                    <div>{employee.access.payslips ? "Payslips" : "No payslips"}</div>
                    <div>{employee.access.documents ? "Documents" : "No documents"}</div>
                    <div>{employee.access.timeOff ? "Time off" : "No time off"}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{employee.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3 text-slate-700">
            <CheckCircle className="size-4 text-green-600" />
            <p className="text-sm font-medium">All employee records are ready for payroll and timesheet assignment.</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Employee portal access</h3>
          <p className="mt-2 text-sm text-slate-500">Grant your team access to payslips, documents, and time-off requests from their employee profile.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">Payslip access</p>
              <p className="mt-1 text-slate-500">Employees can review current and historic payslips securely.</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">Document sharing</p>
              <p className="mt-1 text-slate-500">Provide contracts, right-to-work documents, and policy files to each employee.</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">Time off requests</p>
              <p className="mt-1 text-slate-500">Employees can request leave and view approval status directly from their profile.</p>
            </div>
          </div>
        </div>
      </div>
      <EmployeeOnboardingDialog open={isOnboardingOpen} onOpenChange={setIsOnboardingOpen} />
    </div>
  );
}