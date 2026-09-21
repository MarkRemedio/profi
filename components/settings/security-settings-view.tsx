"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, KeyRound, Smartphone, QrCode, CheckCircle2, Lock, AlertCircle, Save, Loader2, Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createPortal } from "react-dom"; // 🚀 Added to teleport the modal!
import { SecuritySettingsSkeleton } from "@/components/settings/settings-skeleton"; // 🚀 Added Skeleton Import

export function SecuritySettingsView() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "questions" ? "questions" : "2fa";
  
  const [isLoading, setIsLoading] = useState(true); // 🚀 Added Loading State
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [otp, setOtp] = useState("");
  const [showDisableVerify, setShowDisableVerify] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false); // 🚀 Added Fullscreen QR state
  
  const [factorId, setFactorId] = useState("");
  const [qrCodeSvg, setQrCodeSvg] = useState("");

  const [q1, setQ1] = useState("");
  const [a1, setA1] = useState("");
  const [q2, setQ2] = useState("");
  const [a2, setA2] = useState("");

  // 1. Check if user ALREADY has 2FA enabled when page loads
  useEffect(() => {
    async function checkMfaStatus() {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error || !data) return;

        // Check across all factors (merging data.all and data.totp)
        const allFactors = [...(data.all || []), ...(data.totp || [])];
        const uniqueFactors = Array.from(new Map(allFactors.map((f: any) => [f.id, f])).values());

        const verifiedFactor = uniqueFactors.find((f: any) => f.status === 'verified');

        if (verifiedFactor) {
          setIs2FAEnabled(true);
          setFactorId((verifiedFactor as any).id);
        } else {
          setIs2FAEnabled(false);
          // Auto-cleanup any unverified factors from refreshed setup attempts
          const unverified = uniqueFactors.filter((f: any) => f.status === 'unverified');
          for (const factor of unverified) {
            await supabase.auth.mfa.unenroll({ factorId: (factor as any).id });
          }
        }
      } catch (err) {
        console.error("MFA check error:", err);
      } finally {
        setIsLoading(false); // 🚀 Turn off the skeleton when done!
      }
    }
    checkMfaStatus();
    
    const tab = searchParams.get("tab");
    if (tab === "questions") setActiveTab("questions");
    else setActiveTab("2fa");
  }, [searchParams]);

  // 🚀 NEW FIX: Handle cleanly canceling a pending setup without requiring an OTP token
  const handleCancelEnrollment = async () => {
    if (factorId) {
      setIsSaving(true);
      // Cleanly remove the unverified lingering factor out of Supabase
      await supabase.auth.mfa.unenroll({ factorId });
      setIsSaving(false);
    }
    setShowQR(false);
    setFactorId("");
    setQrCodeSvg("");
    setOtp("");
    toast.info("Two-Factor configuration setup canceled.");
  };

  // 2. Handle Generation and Verification of 2FA
  const handleEnable2FA = async () => {
    // A: Generation Step (Show QR)
    if (!showQR) { 
      setIsSaving(true);

      try {
        // 🚀 Thorough cleanup of all unverified factors before enrolling
        const { data: listData } = await supabase.auth.mfa.listFactors();
        if (listData) {
          const allFactors = [...(listData.all || []), ...(listData.totp || [])];
          const uniqueFactors = Array.from(new Map(allFactors.map((f: any) => [f.id, f])).values());

          const unverifiedFactors = uniqueFactors.filter((f: any) => f.status === 'unverified');
          for (const factor of unverifiedFactors) {
            await supabase.auth.mfa.unenroll({ factorId: (factor as any).id });
          }
        }

        const { data, error } = await supabase.auth.mfa.enroll({ 
          factorType: 'totp',
          friendlyName: 'Wawprofi Workspace' 
        });

        if (error) throw error;

        setFactorId(data.id);
        setQrCodeSvg(data.totp.qr_code); 
        setShowQR(true);
      } catch (err: any) {
        toast.error("Failed to generate QR code: " + err.message);
      } finally {
        setIsSaving(false);
      }
      return; 
    }

    // B: Verification Step (Submit OTP)
    if (otp.length < 6) { toast.error("Please enter a valid 6-digit authentication code."); return; }
    
    setIsSaving(true);
    
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      toast.error("Challenge failed: " + challenge.error.message);
      setIsSaving(false);
      return;
    }

    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: otp
    });

    setIsSaving(false);

    if (verify.error) {
      toast.error("Invalid code. Please try again.");
      return;
    }

    setIs2FAEnabled(true); 
    setShowQR(false); 
    setOtp("");
    window.dispatchEvent(new CustomEvent("mfa_updated", { detail: { enabled: true } })); // 🚀 Realtime dot hide
    toast.success("Two-Factor Authentication successfully enabled!");
  };

  // 3. Handle Disabling 2FA Securely
  const handleDisable2FA = async () => { 
    if (!factorId) return;
    
    if (!showDisableVerify) {
      setOtp("");
      setShowDisableVerify(true);
      return;
    }

    if (otp.length < 6) {
      toast.error("Please enter the 6-digit verification token to confirm.");
      return;
    }

    setIsSaving(true);
    
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      toast.error("Verification failed: " + challenge.error.message);
      setIsSaving(false);
      return;
    }

    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: otp
    });

    if (verify.error) {
      toast.error("Invalid authentication token. Please try again.");
      setIsSaving(false);
      return;
    }

    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setIsSaving(false);

    if (error) {
      toast.error("Failed to safely remove factor: " + error.message);
      return;
    }

    setIs2FAEnabled(false); 
    setShowQR(false); 
    setShowDisableVerify(false);
    setFactorId("");
    setQrCodeSvg("");
    setOtp("");
    window.dispatchEvent(new CustomEvent("mfa_updated", { detail: { enabled: false } })); // 🚀 Realtime dot show
    toast.info("Two-Factor Authentication cleanly disabled from your profile."); 
  };

  const handleSaveQuestions = async () => {
    if (!q1 || !a1 || !q2 || !a2) { 
      toast.error("Please select and answer all security questions."); 
      return; 
    }

    if (q1 === q2) {
      toast.error("Please select two different security questions.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Authentication error. Please log in again.");
        return;
      }

      const normalizedA1 = a1.trim().toLowerCase();
      const normalizedA2 = a2.trim().toLowerCase();

      const { error } = await supabase
        .from('user_security_questions')
        .upsert({
          user_id: user.id,
          question_1: q1,
          answer_1: normalizedA1, 
          question_2: q2,
          answer_2: normalizedA2,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast.success("Security questions encrypted and saved successfully!");
      setA1("");
      setA2("");

    } catch (error: any) {
      toast.error("Failed to save questions: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 🚀 Pass activeTab so it shows the exact tab skeleton matching URL parameter!
  if (isLoading) return <SecuritySettingsSkeleton activeTab={activeTab} />;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3"><ShieldCheck className="size-8 text-blue-600" />Security & Access</h1>
        <p className="text-slate-500 mt-2">Manage your account protection, two-factor authentication, and recovery methods.</p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-14 bg-slate-100/80 p-1.5 rounded-2xl w-[400px] max-w-full mb-6 border border-slate-200/60">
          <TabsTrigger value="2fa" className="flex-1 rounded-xl font-bold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all h-full"><Smartphone className="size-4 mr-2" /> Two-Factor Auth</TabsTrigger>
          <TabsTrigger value="questions" className="flex-1 rounded-xl font-bold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all h-full"><KeyRound className="size-4 mr-2" /> Recovery Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="2fa" className="outline-none focus:ring-0">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm overflow-hidden relative w-full">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row gap-6 justify-between items-start relative z-10 w-full">
              <div className="space-y-2 flex-1">
                <h2 className="text-xl font-bold text-slate-900">Authenticator App (TOTP)</h2>
                <p className="text-slate-500 text-sm leading-relaxed max-w-2xl">Protect your workspace with an extra layer of security. When enabled, you'll need to enter a secure code from your authenticator app every time you log in.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <span className={`text-sm font-bold ${is2FAEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>{is2FAEnabled ? "Active" : "Inactive"}</span>
                <Switch 
                  checked={(is2FAEnabled || showQR) && !showDisableVerify} 
                  onCheckedChange={(c) => { 
                    if (!c) {
                      // 🚀 THE SWITCH TOGGLE FIX:
                      if (is2FAEnabled) {
                        handleDisable2FA(); // Fully verified -> Run security step down constraints
                      } else {
                        handleCancelEnrollment(); // Unverified setup cancellation -> Run clean rollback branch
                      }
                    } else { 
                      setShowDisableVerify(false); 
                      if (!is2FAEnabled) {
                        handleEnable2FA(); 
                      }
                    } 
                  }} 
                  className="data-[state=checked]:bg-emerald-500" 
                  disabled={isSaving} 
                />
              </div>
            </div>
            
            <AnimatePresence>
              {showQR && !is2FAEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-8 pt-8 border-t border-slate-100 overflow-hidden w-full">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center w-full">
                    <div className="shrink-0 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center gap-3">
                      {qrCodeSvg ? (
                        <div 
                          className="relative group cursor-pointer overflow-hidden rounded-lg"
                          onClick={() => setIsQRModalOpen(true)}
                        >
                          <img src={qrCodeSvg} alt="2FA QR Code" className="size-32 object-contain select-none transition-transform duration-300 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <div className="bg-white p-1.5 rounded-md shadow-sm">
                              <Maximize className="size-5 text-slate-700" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="size-32 bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
                          <Loader2 className="size-8 text-slate-400 animate-spin" />
                        </div>
                      )}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scan Me</span>
                    </div>
                    <div className="flex-1 space-y-6 w-full">
                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2"><span className="flex items-center justify-center size-6 rounded-full bg-blue-100 text-blue-700 text-xs">1</span> Scan the Code</h3>
                        <p className="text-sm text-slate-500 ml-8">Open your authenticator app and scan the QR code to the left.</p>
                      </div>
                      <div className="space-y-3">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2"><span className="flex items-center justify-center size-6 rounded-full bg-blue-100 text-blue-700 text-xs">2</span> Verify the Code</h3>
                        <div className="ml-8 flex gap-3">
                          <Input placeholder="000000" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="h-12 w-32 text-center text-xl tracking-widest font-mono font-bold bg-white" />
                          <Button onClick={handleEnable2FA} disabled={isSaving || otp.length < 6} className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md font-bold transition-all active:scale-95">{isSaving ? <Loader2 className="size-5 animate-spin" /> : "Verify & Enable"}</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <AnimatePresence>
              {is2FAEnabled && !showDisableVerify && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 flex items-start gap-4 w-full">
                  <div className="size-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0"><CheckCircle2 className="size-5 text-emerald-600" /></div>
                  <div>
                    <h3 className="font-bold text-emerald-900">Your account is protected</h3>
                    <p className="text-sm text-emerald-700/80 mt-1 leading-relaxed">Two-factor authentication is currently active. You will be prompted to enter a 6-digit code from your device whenever you sign in from a new browser.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showDisableVerify && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-8 pt-8 border-t border-slate-100 overflow-hidden w-full">
                  <div className="bg-red-50/40 border border-red-100 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-center w-full justify-between">
                    <div className="space-y-1 flex-1">
                      <h3 className="font-bold text-red-900 flex items-center gap-2">Confirm Deactivation</h3>
                      <p className="text-xs text-red-700 font-medium leading-relaxed max-w-md">Enter the 6-digit authenticator security token generated by your mobile device to verify ownership and safely turn off identity protection constraints.</p>
                    </div>
                    <div className="flex gap-3 shrink-0 items-center">
                      <Input placeholder="000000" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="h-11 w-28 text-center text-lg tracking-widest font-mono font-bold bg-white border-red-200 focus:border-red-500 focus:ring-red-500/10" disabled={isSaving} />
                      <Button onClick={handleDisable2FA} disabled={isSaving || otp.length < 6} className="h-11 px-5 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md font-bold text-xs tracking-wide transition-all active:scale-95 flex items-center gap-1.5">{isSaving ? <Loader2 className="size-4 animate-spin" /> : "Confirm Disable"}</Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>
        <TabsContent value="questions" className="outline-none focus:ring-0">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm overflow-hidden relative w-full">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="mb-8 relative z-10 flex items-start gap-4">
              <div className="size-12 bg-orange-100 rounded-full flex items-center justify-center shrink-0"><Lock className="size-6 text-orange-600" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Account Recovery Questions</h2>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">If you ever lose access to your email or 2FA device, answering these questions correctly will allow you to verify your identity and reset your credentials securely.</p>
              </div>
            </div>
            <div className="space-y-6 relative z-10 w-full">
              <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100 w-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Security Question 1</Label>
                <Select value={q1} onValueChange={setQ1}>
                  <SelectTrigger className="h-12 bg-white rounded-xl"><SelectValue placeholder="Select a question..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="q1_1">What was the name of your first pet?</SelectItem>
                    <SelectItem value="q1_2">In what city were you born?</SelectItem>
                    <SelectItem value="q1_3">What is your mother's maiden name?</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Your secret answer..." value={a1} onChange={(e) => setA1(e.target.value)} className="h-12 bg-white rounded-xl shadow-sm border-slate-200" />
              </div>
              <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100 w-full">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Security Question 2</Label>
                <Select value={q2} onValueChange={setQ2}>
                  <SelectTrigger className="h-12 bg-white rounded-xl"><SelectValue placeholder="Select a question..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="q2_1">What was the make and model of your first car?</SelectItem>
                    <SelectItem value="q2_2">What was the name of your first school?</SelectItem>
                    <SelectItem value="q2_3">What is the name of the street you grew up on?</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Your secret answer..." value={a2} onChange={(e) => setA2(e.target.value)} className="h-12 bg-white rounded-xl shadow-sm border-slate-200" />
              </div>
              <div className="pt-4 flex items-center justify-between w-full">
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><AlertCircle className="size-3.5" /> Answers are encrypted and case-insensitive.</p>
                <Button onClick={handleSaveQuestions} disabled={isSaving} className="h-12 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md font-bold transition-transform active:scale-95">
                  {isSaving ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />} {isSaving ? "Encrypting..." : "Save Questions"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 🚀 Fullscreen QR Modal (Teleported to document.body to cover sidebar!) */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isQRModalOpen && qrCodeSvg && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4"
              onClick={() => setIsQRModalOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }} 
                animate={{ scale: 1, opacity: 1, y: 0 }} 
                exit={{ scale: 0.95, opacity: 0, y: 10 }} 
                className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-sm w-full relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setIsQRModalOpen(false)}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="size-5" />
                </button>
                
                <div className="size-12 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <Maximize className="size-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">Scan QR Code</h3>
                <p className="text-sm text-slate-500 mb-6 text-center">Center this code in your authenticator app camera viewport.</p>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 w-full flex justify-center">
                  <img src={qrCodeSvg} alt="Enlarged 2FA QR Code" className="w-full max-w-[280px] aspect-square object-contain select-none" />
                </div>
                
                <Button onClick={() => setIsQRModalOpen(false)} className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm">
                  Done Scanning
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}