"use client";

import { useState } from "react";
import {
  UserCircle,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Calendar,
  Edit2,
  Save,
  CreditCard,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const employeeData = {
  firstName: "Alice",
  lastName: "Johnson",
  email: "alice.johnson@demo.com",
  phone: "+44 7700 900001",
  employeeId: "EMP-001",
  department: "Retail Operations",
  role: "Store Manager",
  startDate: "2020-03-15",
  niNumber: "AB123456C",
  address: "123 High Street, London, UK",
  emergencyContact: {
    name: "Bob Johnson",
    phone: "+44 7700 900002",
    relationship: "Spouse",
  },
  bankDetails: {
    accountName: "Alice Johnson",
    sortCode: "20-00-00",
    accountNumber: "****5678",
  },
};

export function MyProfile() {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(employeeData);

  const handleSave = () => {
    setIsEditing(false);
    toast.success("Profile updated successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-500">View and update your personal information</p>
        </div>
        <Button 
          variant={isEditing ? "default" : "outline"}
          className={isEditing ? "bg-blue-600 hover:bg-blue-700 gap-2" : "gap-2"}
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
        >
          {isEditing ? <><Save className="h-4 w-4" /> Save</> : <><Edit2 className="h-4 w-4" /> Edit</>}
        </Button>
      </div>

      {/* Profile Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-6">
          <div className="h-24 w-24 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-3xl font-bold text-blue-600">{formData.firstName[0]}{formData.lastName[0]}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-slate-900">{formData.firstName} {formData.lastName}</h2>
              <Badge className="bg-blue-100 text-blue-700">{formData.role}</Badge>
            </div>
            <p className="text-slate-500 mb-4">{formData.department}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="h-4 w-4" />
                {formData.employeeId}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4" />
                {formData.email}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4" />
                {formData.phone}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            Personal Information
          </h3>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">First Name</label>
                <Input 
                  value={formData.firstName} 
                  disabled={!isEditing}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Last Name</label>
                <Input 
                  value={formData.lastName} 
                  disabled={!isEditing}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input 
                type="email"
                value={formData.email} 
                disabled={!isEditing}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone</label>
              <Input 
                value={formData.phone} 
                disabled={!isEditing}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Address</label>
              <Input 
                value={formData.address} 
                disabled={!isEditing}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">National Insurance Number</label>
              <Input value={formData.niNumber} disabled className="bg-slate-50" />
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Employment Details
          </h3>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Employee ID</label>
                <Input value={formData.employeeId} disabled className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Start Date</label>
                <Input value={formData.startDate} disabled className="bg-slate-50" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Department</label>
                <Input value={formData.department} disabled className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Role</label>
                <Input value={formData.role} disabled className="bg-slate-50" />
              </div>
            </div>
          </div>

          <h3 className="font-semibold text-slate-900 mt-6 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Emergency Contact
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Contact Name</label>
              <Input 
                value={formData.emergencyContact.name} 
                disabled={!isEditing}
                onChange={(e) => setFormData({...formData, emergencyContact: {...formData.emergencyContact, name: e.target.value}})}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <Input 
                  value={formData.emergencyContact.phone} 
                  disabled={!isEditing}
                  onChange={(e) => setFormData({...formData, emergencyContact: {...formData.emergencyContact, phone: e.target.value}})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Relationship</label>
                <Input 
                  value={formData.emergencyContact.relationship} 
                  disabled={!isEditing}
                  onChange={(e) => setFormData({...formData, emergencyContact: {...formData.emergencyContact, relationship: e.target.value}})}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Bank Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Account Name</label>
            <Input value={formData.bankDetails.accountName} disabled className="bg-slate-50" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Sort Code</label>
            <Input value={formData.bankDetails.sortCode} disabled className="bg-slate-50" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Account Number</label>
            <Input value={formData.bankDetails.accountNumber} disabled className="bg-slate-50" />
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-4">To update bank details, please contact HR.</p>
      </div>
    </div>
  );
}
