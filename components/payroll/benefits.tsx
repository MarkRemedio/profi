"use client";

import { useState } from "react";
import {
  Heart,
  Shield,
  Sparkles,
  Zap,
  CheckCircle2,
  ExternalLink,
  Eye,
  Building2,
  GraduationCap,
  Bike,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const myBenefits = [
  { 
    id: "1", 
    name: "Private Health Insurance", 
    provider: "Bupa", 
    status: "active", 
    enrolled: "2020-03-15",
    icon: Shield,
    color: "bg-blue-100 text-blue-600",
    description: "Comprehensive health coverage including dental and optical",
    details: ["GP visits covered", "Specialist consultations", "Dental care", "Optical care"]
  },
  { 
    id: "2", 
    name: "Pension Scheme", 
    provider: "Aviva", 
    status: "active", 
    enrolled: "2020-03-15",
    icon: Building2,
    color: "bg-green-100 text-green-600",
    description: "Company pension with 5% employer contribution",
    details: ["5% employer match", "Tax relief on contributions", "Flexible contributions"]
  },
  { 
    id: "3", 
    name: "Life Insurance", 
    provider: "Legal & General", 
    status: "active", 
    enrolled: "2020-03-15",
    icon: Sparkles,
    color: "bg-purple-100 text-purple-600",
    description: "4x annual salary life cover",
    details: ["4x salary coverage", "Family benefits", "Critical illness included"]
  },
  { 
    id: "4", 
    name: "Cycle to Work", 
    provider: "Cyclescheme", 
    status: "active", 
    enrolled: "2023-06-01",
    icon: Bike,
    color: "bg-orange-100 text-orange-600",
    description: "Save up to 42% on bikes and accessories",
    details: ["Up to £2,000 voucher", "Tax savings", "12-month repayment"]
  },
];

const availableBenefits = [
  { 
    id: "5", 
    name: "Gym Membership", 
    provider: "PureGym", 
    discount: "40% off",
    icon: Zap,
    color: "bg-red-100 text-red-600",
    description: "Corporate discount on annual membership"
  },
  { 
    id: "6", 
    name: "Learning & Development", 
    provider: "Udemy Business", 
    discount: "Free access",
    icon: GraduationCap,
    color: "bg-indigo-100 text-indigo-600",
    description: "Unlimited access to professional courses"
  },
  { 
    id: "7", 
    name: "Employee Assistance", 
    provider: "LifeWorks", 
    discount: "Free",
    icon: Users,
    color: "bg-teal-100 text-teal-600",
    description: "24/7 mental health and wellbeing support"
  },
];

export function Benefits() {
  const [selectedBenefit, setSelectedBenefit] = useState<typeof myBenefits[0] | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Benefits</h1>
          <p className="text-sm text-slate-500">View and manage your employee benefits</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Active Benefits</p>
              <p className="text-2xl font-bold text-slate-900">{myBenefits.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Heart className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Annual Value</p>
              <p className="text-2xl font-bold text-blue-600">£4,250</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Available</p>
              <p className="text-2xl font-bold text-purple-600">{availableBenefits.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* My Active Benefits */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Active Benefits
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {myBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div 
                key={benefit.id} 
                className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedBenefit(benefit)}
              >
                <div className="flex items-start gap-4">
                  <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center", benefit.color)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{benefit.name}</p>
                      <Badge className="bg-green-100 text-green-700">Active</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{benefit.provider}</p>
                    <p className="text-xs text-slate-400 mt-1">Enrolled: {benefit.enrolled}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Benefits */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Available to Enroll
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {availableBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.id} className="p-4 border border-slate-200 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center", benefit.color)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{benefit.name}</p>
                      <Badge variant="secondary">{benefit.discount}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{benefit.provider}</p>
                    <p className="text-sm text-slate-600 mt-2">{benefit.description}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3"
                      onClick={() => toast.success(`Enrollment request sent for ${benefit.name}`)}
                    >
                      Enroll Now
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Benefit Detail Dialog */}
      <Dialog open={!!selectedBenefit} onOpenChange={() => setSelectedBenefit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedBenefit?.name}</DialogTitle>
            <DialogDescription>{selectedBenefit?.description}</DialogDescription>
          </DialogHeader>
          {selectedBenefit && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center", selectedBenefit.color)}>
                  <selectedBenefit.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{selectedBenefit.provider}</p>
                  <Badge className="bg-green-100 text-green-700">{selectedBenefit.status}</Badge>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-3">What's Included:</h4>
                <ul className="space-y-2">
                  {selectedBenefit.details.map((detail, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Provider Portal
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={() => toast.success("Benefit details downloaded")}>
                  <Eye className="h-4 w-4" />
                  View Documents
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
