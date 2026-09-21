"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom"; 
import { Shield, UserPlus, Users, Trash2, Mail, User, KeyRound, Save, XCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WORKSPACE_SETTINGS_FEATURE } from "@/lib/accounting/workspace-permissions";
import { useChartOfAccounts } from "@/components/chart-of-accounts/use-chart-of-accounts"; // 🚀 Get plan features
import { 
  inviteTeamMemberAction, 
  updateUserRoleAction, 
  removeTeamMemberAction,
  updateProfileMetadataAction,
  triggerPasswordResetAction,
  revokeInvitationAction // 🚀 New Action Added Here
} from "@/app/(dashboard)/settings/profile-access/actions";

interface ProfileAccessViewProps {
  organizationId: string;
  currentPlanName: string;
  allowedSeats: number;
  currentUserId: string; 
  currentUserEmail: string;
  initialFirstName: string;
  initialLastName: string;
  members: Array<{
    id: string;
    role: "OWNER" | "ACCOUNTANT" | "EMPLOYEE" | "CUSTOM";
    customFeatures: string[]; // 🚀 NEW: Receive existing configuration arrays from backend
    user: {
      id: string;
      email: string | null;
      raw_user_meta_data: any;
    };
  }>;
  // 🚀 New Prop to accept pending invites from the server
  pendingInvites: Array<{
    id: string;
    email: string;
    role: "OWNER" | "ACCOUNTANT" | "EMPLOYEE" | "CUSTOM"; // 🚀 Added CUSTOM here
    expiresAt: Date;
  }>;
  role?: string | null; // 🚀 Added Role security property
}



const ROLE_GUIDES: Record<string, { title: string; desc: string; badge: string; bg: string; border: string; borderLeft: string; text: string }> = {
  EMPLOYEE: {
    title: "Employee (Standard Access)",
    desc: "Can view the main Dashboard summaries and handle their own personal security settings (2FA/Security Questions). All core modules like Sales, Invoices, Purchases, Accounting ledgers, Reports, and Company Billing are completely hidden.",
    badge: "Dashboard Only",
    bg: "bg-slate-50/50",
    border: "border-slate-200",
    borderLeft: "border-l-slate-400",
    text: "text-slate-600"
  },
  ACCOUNTANT: {
    title: "Accountant (Financial View)",
    desc: "Full operations access for general bookkeeping. Can view and modify Sales Invoices, Purchasing Bills, Bank transactions, Manual Journals, and run system Audit Trail Logs. Completely locked out of the physical POS Terminal register and Company Billing.",
    badge: "Ledger Access",
    bg: "bg-blue-50/30",
    border: "border-blue-100",
    borderLeft: "border-l-blue-500",
    text: "text-blue-900/80"
  },
  OWNER: {
    title: "Owner (Full Admin Controls)",
    desc: "Absolute system authority. Full visibility into all operational modules, team seat permission managers, workspace parameters, Stripe transaction history logs, and direct database subscription licensing tier upgrades.",
    badge: "Full Admin",
    bg: "bg-purple-50/30",
    border: "border-purple-100",
    borderLeft: "border-l-purple-500",
    text: "text-purple-900/80"
  },
  CUSTOM: {
    title: "Custom Role (Modular Access)",
    desc: "Build a bespoke permission profile. You define exactly which modules (Sales, Purchases, Banking, etc.) this teammate can interact with. Perfect for specialized roles like Sales Reps or Cashiers.",
    badge: "Configurable",
    bg: "bg-emerald-50/40",
    border: "border-emerald-200",
    borderLeft: "border-l-emerald-500",
    text: "text-emerald-900/80"
  }
};

export function ProfileAccessView({ 
  organizationId, currentPlanName, allowedSeats, members, pendingInvites, currentUserId,
  currentUserEmail, initialFirstName, initialLastName,
  role // 🚀 Destructure role parameter
}: ProfileAccessViewProps) {
  
  // 🚀 Normalize the user role context text securely
  const userRole = String(role || "EMPLOYEE").toUpperCase();
  const workspace = useChartOfAccounts();
  const orgFeatures = (workspace.organization as any)?.features || ["sales", "purchases", "banking", "accounting", "reports"];

  // Tab Controller View Toggle Switch
  const [activeTab, setActiveTab] = useState<"profile" | "team">("profile");

  // Account Form States
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingPassword, setIsSendingPassword] = useState(false);

  // Invite Management Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<"OWNER" | "ACCOUNTANT" | "EMPLOYEE" | "CUSTOM">("EMPLOYEE");
  const [selectedCustomFeatures, setSelectedCustomFeatures] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 🚀 NEW: Edit Existing Permissions Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberEmail, setEditingMemberEmail] = useState("");
  const [editingFeatures, setEditingFeatures] = useState<string[]>([]);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateProfileMetadataAction(currentUserId, firstName, lastName);
      toast.success("Personal information card updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save data modifications.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordReset() {
    setIsSendingPassword(true);
    try {
      await triggerPasswordResetAction(currentUserEmail);
      toast.success(`Security recovery reset link transmitted to ${currentUserEmail}`);
    } catch (err: any) {
      toast.error(err.message || "Password recovery deployment failed.");
    } finally {
      setIsSendingPassword(false);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 🚀 Pass the selected features only if the role is CUSTOM
      const finalFeatures = roleInput === "CUSTOM" ? selectedCustomFeatures : [];
      
      // 🚀 1. Capture the response from the server!
      const res = await inviteTeamMemberAction(organizationId, emailInput, roleInput, finalFeatures);
      
     // 🛡️ 2. INTERCEPT ERRORS GRACEFULLY!
      if (res && !res.success) {
        if (res.error === "Plan Limit Reached") {
          // Show Upgrade Button for Seat Limits
          toast.error("Plan Limit Reached", {
            description: <span className="text-slate-600 font-medium">{res.message}</span>,
            action: {
              label: "Upgrade Plan",
              onClick: () => window.location.href = "/settings/billing" 
            }
          });
        } else {
          // Show Standard Toast for Duplicates (Already a member, already invited)
          toast.error("Notice", {
            description: <span className="text-slate-600 font-medium">{res.message}</span>
          });
        }
        return; // Stop execution
      }

      // ✅ 3. Success Path
      toast.success("Invitation sent successfully!");
      setIsModalOpen(false);
      setEmailInput("");
      setSelectedCustomFeatures([]); // Reset choices
    } catch (err: any) {
      toast.error(err.message || "A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRoleChange(roleId: string, nextRole: "OWNER" | "ACCOUNTANT" | "EMPLOYEE" | "CUSTOM", existingFeatures: string[] = []) {
    // 🚀 If switching to CUSTOM from the dropdown table directly, prompt the editing options panel!
    if (nextRole === "CUSTOM") {
      const targetMember = members.find(m => m.id === roleId);
      setEditingMemberId(roleId);
      setEditingMemberEmail(targetMember?.user.email || "Teammate");
      setEditingFeatures(targetMember?.customFeatures || existingFeatures);
      setIsEditModalOpen(true);
      return;
    }

    try {
      await updateUserRoleAction(roleId, nextRole, []);
      toast.success("Permissions updated successfully.");
    } catch (err) {
      toast.error("Failed to alter authorization privileges.");
    }
  }

  // 🚀 NEW: Handles submitting the saved edits for existing custom role features array
  async function handleEditPermissionsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMemberId) return;
    setIsUpdatingPermissions(true);
    try {
      await updateUserRoleAction(editingMemberId, "CUSTOM", editingFeatures);
      toast.success("Custom role tracking permissions updated successfully!");
      setIsEditModalOpen(false);
    } catch (err) {
      toast.error("Failed to reconfigure custom module limits.");
    } finally {
      setIsUpdatingPermissions(false);
    }
  }

  async function handleRemoveMember(roleId: string, email: string) {
    const confirmDelete = confirm(`Are you sure you want to remove ${email} from this organization?`);
    if (!confirmDelete) return;

    try {
      await removeTeamMemberAction(roleId);
      toast.success("Access privileges terminated.");
    } catch (err) {
      toast.error("Could not drop user access space.");
    }
  }

  // 🚀 New function to revoke pending invites
  async function handleRevokeInvite(inviteId: string, email: string) {
    const confirmRevoke = confirm(`Are you sure you want to cancel the invitation sent to ${email}?`);
    if (!confirmRevoke) return;

    try {
      await revokeInvitationAction(inviteId);
      toast.success("Invitation revoked successfully.");
    } catch (err) {
      toast.error("Failed to cancel invitation.");
    }
  }

  // Calculate true seat usage
  const totalSeatsUsed = members.length + (pendingInvites?.length || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {userRole === "OWNER" ? "Profile & Access" : "My Profile Settings"}
        </h1>
        <p className="text-sm text-slate-500">
          {userRole === "OWNER" 
            ? "Configure individual personal parameters or modify administrative team access permissions" 
            : "Manage your personal account identity, credential parameters, and security passphrase options"}
        </p>
        
        {/* 🚀 Render Tab Switcher ONLY if user is a system Owner */}
        {userRole === "OWNER" && (
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl w-fit mt-4 animate-in fade-in">
            <button 
              type="button"
              onClick={() => setActiveTab("profile")}
              className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all", 
                activeTab === "profile" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              My Profile
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab("team")}
              className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all", 
                activeTab === "team" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Team Access Management
            </button>
          </div>
        )}
      </div>

      {activeTab === "profile" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
          <form onSubmit={handleUpdateProfile} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Personal Account Identity</h3>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">First Name</label>
                <input 
                  type="text" 
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)} 
                  placeholder="" 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Last Name</label>
                <input 
                  type="text" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)} 
                  placeholder="" 
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:bg-white focus:outline-none transition font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address (Locked)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                <input 
                  type="email" 
                  disabled 
                  value={currentUserEmail} 
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-3 py-2 text-sm text-slate-400 font-medium cursor-not-allowed select-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 pl-1">Security policies prohibit system-wide changes to username registration emails locally.</p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <Button type="submit" disabled={isSavingProfile} className="bg-blue-600 text-white hover:bg-blue-700 gap-1.5 rounded-xl text-xs font-bold shadow-sm">
                <Save className="size-3.5" /> {isSavingProfile ? "Saving Profile..." : "Save Profile Details"}
              </Button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Credential Control</h3>
              <p className="text-xs text-slate-500 mt-0.5">Initialize multi-factor tokens or apply system adjustments to your pass phrase security layers.</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center space-y-3">
              <div className="mx-auto rounded-full bg-blue-50 p-2.5 text-blue-600 w-fit">
                <KeyRound className="size-4" />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-800">Request Password Alteration</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Triggers an encrypted token verification log sequence immediately to your inbox.</p>
              </div>
              <Button 
                type="button" 
                onClick={handlePasswordReset} 
                disabled={isSendingPassword}
                className="w-full bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 text-xs font-bold rounded-xl shadow-sm"
              >
                {isSendingPassword ? "Transmitting link..." : "Email Reset Password Link"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "team" && userRole === "OWNER" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Workspace Seats</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">
                  {/* 🚀 Changed to totalSeatsUsed to include pending invites */}
                  {totalSeatsUsed} <span className="text-xs font-medium text-slate-400">/ {allowedSeats === -1 ? "∞ Unlimited" : `${allowedSeats} Available`}</span>
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
              <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                <Shield className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Licensing Tier</p>
                <p className="text-xl font-black text-indigo-600 mt-0.5 capitalize">
                  {currentPlanName.toLowerCase().includes("plan") 
                    ? currentPlanName 
                    : `${currentPlanName} Plan`}
                </p>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-1 flex items-center justify-end">
              <Button onClick={() => setIsModalOpen(true)} className="w-full lg:w-auto bg-blue-600 text-white hover:bg-blue-700 gap-1.5 rounded-xl text-xs font-bold shadow-sm py-5 lg:py-2">
                <UserPlus className="size-4" /> Add Team Member
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Workspace User Directory</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-4 pl-6">Teammate Account Identity</th>
                    <th className="p-4">Authorization Role Level</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                  
                  {/* 🚀 Active Members Rendering */}
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 pl-6">
                        <div>
                          <p className="font-bold text-slate-900 flex items-center gap-2">
                            {member.user.raw_user_meta_data?.display_name || member.user.raw_user_meta_data?.name || "Active Employee"}
                            {member.user.id === currentUserId && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider select-none">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">{member.user.email}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            disabled={member.user.id === currentUserId} 
                            onChange={(e) => handleRoleChange(member.id, e.target.value as any, member.customFeatures)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-70 disabled:bg-slate-50"
                          >
                            <option value="EMPLOYEE">Employee (Standard Access)</option>
                            <option value="ACCOUNTANT">Accountant (Financial View Only)</option>
                            <option value="OWNER">Owner (Full Admin Controls)</option>
                            <option value="CUSTOM">Custom Role</option>
                          </select>

                          {/* 🚀 NEW: Interactive operational checklist edit modal launcher tool */}
                          {member.role === "CUSTOM" && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMemberId(member.id);
                                setEditingMemberEmail(member.user.email || "Teammate");
                                setEditingFeatures(member.customFeatures || []);
                                setIsEditModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                              title="Modify Module Clearances"
                            >
                              <Settings className="size-4 animate-hover group-hover:rotate-45 duration-200" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        {member.user.id !== currentUserId ? (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.user.email || "")}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Revoke platform access"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic pr-2 select-none font-semibold">System Core</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* 🚀 Pending Invites Rendering */}
                  {pendingInvites && pendingInvites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-slate-50/40 transition-colors bg-slate-50/20">
                      <td className="p-4 pl-6">
                        <div>
                          <p className="font-bold text-slate-500 flex items-center gap-2">
                            Pending User
                            <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-100 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider select-none">
                              Invited
                            </span>
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">{invite.email}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 block w-fit capitalize">
                          {invite.role === "CUSTOM" ? "Custom Role" : invite.role.toLowerCase()}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handleRevokeInvite(invite.id, invite.email)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition"
                          title="Cancel Invitation"
                        >
                          <XCircle className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL REMAINS UNCHANGED */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Team Member</h3>
              <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Account Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Assigned Access Level</label>
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:bg-white focus:outline-none transition font-semibold"
                >
                  <option value="EMPLOYEE">Employee (Standard Access)</option>
                  <option value="ACCOUNTANT">Accountant (Financial View Only)</option>
                  <option value="OWNER">Owner (Full Admin Controls)</option>
                  <option value="CUSTOM">Custom Role (Select Modules)</option>
                </select>

                {/* 🚀 STABILIZER CONTAINER: Prevents modal jumping by locking dynamic content to 350px */}
                <div className="my-4 h-[370px] overflow-y-auto pr-1 flex flex-col justify-start gap-3 scrollbar-thin">
                  
                  {/* 🚀 PLAN-AWARE CHECKBOX ENGINE FOR CUSTOM ROLES */}
                  {roleInput === "CUSTOM" && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">Select Permitted Modules</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">Teammates can only access the systems checked below.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        {[
                          { id: "sales", label: "Sales & Invoices" },
                          { id: "purchases", label: "Purchases & Bills" },
                          { id: "banking", label: "Banking & Feeds" },
                          { id: "payroll", label: "Payroll Management" },
                          { id: "pos", label: "Point of Sale (POS)" },
                          { id: "taxes", label: "Taxes & VAT" },
                          { id: "accounting", label: "Core Ledgers / Chart" },
                          { id: "reports", label: "Financial Reports" }
                        ]
                        .filter((mod) => orgFeatures.includes(mod.id))
                        .map((mod) => {
                          return (
                            <label 
                              key={mod.id} 
                              className="flex items-center gap-2.5 rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-xs cursor-pointer select-none hover:bg-slate-50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedCustomFeatures.includes(mod.id)}
                                className="accent-blue-600 rounded size-3.5 cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCustomFeatures([...selectedCustomFeatures, mod.id]);
                                  } else {
                                    setSelectedCustomFeatures(selectedCustomFeatures.filter(id => id !== mod.id));
                                  }
                                }}
                              />
                              <span className="text-xs font-semibold text-slate-700">{mod.label}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Not a plan feature like the modules above — those say
                          what the organisation bought. This says who inside it
                          may read the workspace's tax identifiers, so it is
                          offered whatever the plan includes. */}
                      <div className="border-t border-slate-200 pt-3">
                        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-xs cursor-pointer select-none hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedCustomFeatures.includes(WORKSPACE_SETTINGS_FEATURE)}
                            className="accent-blue-600 rounded size-3.5 cursor-pointer mt-0.5"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCustomFeatures([
                                  ...selectedCustomFeatures,
                                  WORKSPACE_SETTINGS_FEATURE,
                                ]);
                              } else {
                                setSelectedCustomFeatures(
                                  selectedCustomFeatures.filter(
                                    (id) => id !== WORKSPACE_SETTINGS_FEATURE
                                  )
                                );
                              }
                            }}
                          />
                          {/* Named for what ticking it grants, not for the page
                              it appears on. Everyone can already open Workspace
                              Settings — that is where their own notification
                              preferences live — so a checkbox called "Workspace
                              Settings" would read as granting access they
                              already have. What it actually unlocks is the
                              business half. */}
                          <span>
                            <span className="block text-xs font-semibold text-slate-700">
                              Configure currency, VAT &amp; tax profile
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              Adds these sections to their Workspace Settings page, including the
                              UTR and PAYE reference. Without it they see only their own
                              notification settings there.
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* 🚀 REAL-TIME ACCESS CONTROL DOCUMENTATION PANEL */}
                  {(() => {
                    const guide = ROLE_GUIDES[roleInput] || ROLE_GUIDES.EMPLOYEE;
                    return (
                      <div className={cn(
                        "rounded-xl border-l-4 border p-3.5 space-y-1.5 transition-all duration-200 animate-in fade-in-50 slide-in-from-top-1",
                        guide.bg, guide.border, guide.borderLeft
                      )}>
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                            {guide.title}
                          </h4>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-white shadow-2xs text-slate-500 select-none">
                            {guide.badge}
                          </span>
                        </div>
                        <p className={cn("text-xs font-medium leading-relaxed", guide.text)}>
                          {guide.desc}
                        </p>
                      </div>
                    );
                  })()}
                  
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-xl text-xs text-slate-600">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold">
                  {isSubmitting ? "Adding Access space..." : "Authorize Member Access"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 🚀 NEW: GRANULAR EDIT PERMISSIONS MODAL LAYOUT */}
      {isEditModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Configure Permissions</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editingMemberEmail}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditPermissionsSubmit} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Select Permitted Modules</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Adjust operational module accesses on demand.</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {[
                    { id: "sales", label: "Sales & Invoices" },
                    { id: "purchases", label: "Purchases & Bills" },
                    { id: "banking", label: "Banking & Feeds" },
                    { id: "payroll", label: "Payroll Management" },
                    { id: "pos", label: "Point of Sale (POS)" },
                    { id: "taxes", label: "Taxes & VAT" },
                    { id: "accounting", label: "Core Ledgers / Chart" },
                    { id: "reports", label: "Financial Reports" }
                  ]
                  .filter((mod) => orgFeatures.includes(mod.id)) // 👑 ENFORCE OWNER SUBSCRIPTION LICENSE FILTERS DYNAMICALLY!
                  .map((mod) => (
                    <label 
                      key={mod.id} 
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-xs cursor-pointer select-none hover:bg-slate-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={editingFeatures.includes(mod.id)}
                        className="accent-blue-600 rounded size-3.5 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditingFeatures([...editingFeatures, mod.id]);
                          } else {
                            setEditingFeatures(editingFeatures.filter(id => id !== mod.id));
                          }
                        }}
                      />
                      <span className="text-xs font-semibold text-slate-700">{mod.label}</span>
                    </label>
                  ))}
                </div>

                {/* Offered whatever the plan includes — see the note on the
                    invite panel. */}
                <div className="border-t border-slate-200 pt-3">
                  <label className="flex items-start gap-2.5 rounded-lg border border-slate-200/60 bg-white p-2.5 shadow-xs cursor-pointer select-none hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={editingFeatures.includes(WORKSPACE_SETTINGS_FEATURE)}
                      className="accent-blue-600 rounded size-3.5 cursor-pointer mt-0.5"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditingFeatures([...editingFeatures, WORKSPACE_SETTINGS_FEATURE]);
                        } else {
                          setEditingFeatures(
                            editingFeatures.filter((id) => id !== WORKSPACE_SETTINGS_FEATURE)
                          );
                        }
                      }}
                    />
                    <span>
                      <span className="block text-xs font-semibold text-slate-700">
                        Configure currency, VAT &amp; tax profile
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        Adds these sections to their Workspace Settings page, including the UTR
                        and PAYE reference. Without it they see only their own notification
                        settings there.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)} className="rounded-xl text-xs text-slate-600">
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdatingPermissions} className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold">
                  {isUpdatingPermissions ? "Saving Privileges..." : "Apply Permissions Update"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}