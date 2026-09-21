"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { evaluatePassword, PASSWORD_RULES } from "@/lib/auth/password-rules";
import { 
  Building2, ChevronRight, Loader2, 
  ShieldCheck, ArrowLeft, Eye, EyeOff, MailCheck, User,
  Calculator, Receipt, Landmark, FileText, PieChart, PoundSterling,
  CheckCircle2, Check, X // 🚀 ADDED THESE ICONS
} from "lucide-react";
import { signUpUser } from "@/app/signup/actions";
import { PhoneInput } from "@/components/ui/phone-input";

// 🚀 3-STEP SIGNUP PROGRESS BAR
const STEPS = [
  { id: 1, title: "Basic Info", icon: User },
  { id: 2, title: "Security", icon: ShieldCheck },
  { id: 3, title: "Verify", icon: MailCheck },
];

// The rules now live in lib/auth/password-rules.ts, shared with the two invite
// flows and with the server actions that enforce them. They were defined here,
// copied into the client-invite action, and absent entirely from the team
// invite — so which password was acceptable depended on which door you came in
// through.

// 🎨 WHITE, ORANGE & BLUE FLOATING ECOSYSTEM DATA
const FLOATING_BADGES = [
  {
    id: "calc", label: "CALC.ENGINE", icon: Calculator,
    color: "text-blue-600", bg: "bg-white", border: "border-blue-200", shadow: "shadow-blue-500/10",
    initial: { x: -200, y: -200, opacity: 0 }, target: { top: "12%", left: "15%" }, 
    parallax: { x: -30, y: -15 }, delay: 0.1,
  },
  {
    id: "mtd", label: "MTD_INVOICE", icon: Receipt,
    color: "text-orange-500", bg: "bg-white", border: "border-orange-200", shadow: "shadow-orange-500/10",
    initial: { x: 200, y: -200, opacity: 0 }, target: { top: "18%", right: "12%" }, 
    parallax: { x: 40, y: -20 }, delay: 0.3,
  },
  {
    id: "ledger", label: "LEDGER_VAT", icon: PieChart,
    color: "text-blue-600", bg: "bg-white", border: "border-blue-200", shadow: "shadow-blue-500/10",
    initial: { x: -200, y: 200, opacity: 0 }, target: { bottom: "15%", left: "12%" }, 
    parallax: { x: -40, y: 20 }, delay: 0.5,
  },
  {
    id: "bank", label: "OPEN_BANKING", icon: Landmark,
    color: "text-orange-500", bg: "bg-white", border: "border-orange-200", shadow: "shadow-orange-500/10",
    initial: { x: 200, y: 200, opacity: 0 }, target: { bottom: "10%", right: "15%" }, 
    parallax: { x: 30, y: 25 }, delay: 0.7,
  },
  {
    id: "gbp", label: "GBP_BALANCE", icon: PoundSterling,
    color: "text-blue-500", bg: "bg-white", border: "border-blue-200", shadow: "shadow-blue-500/10",
    initial: { x: -300, y: 0, opacity: 0 }, target: { top: "45%", left: "4%" }, 
    parallax: { x: -50, y: 0 }, delay: 0.9,
  },
  {
    id: "tax", label: "AUTO_TAX", icon: FileText,
    color: "text-orange-500", bg: "bg-white", border: "border-orange-200", shadow: "shadow-orange-500/10",
    initial: { x: 300, y: 0, opacity: 0 }, target: { top: "55%", right: "5%" }, 
    parallax: { x: 50, y: 0 }, delay: 1.1,
  },
];

export function SignupView() {
  const searchParams = useSearchParams();
  const selectedPlan = searchParams.get("plan") || "starter";
  
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "", // 🚀 Clean string, PhoneInput handles the code natively!
    location: "United Kingdom",
    language: "en", 
    businessType: "",
    customBusinessType: "", // 🚀 NEW: State for "Other" text input
    termsAccepted: false,
    password: "",
    confirmPassword: "",
  });

  const updateForm = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // 🚀 ADDED: PASSWORD VALIDATION LOGIC
  const passwordRulesPassed = evaluatePassword(formData.password);

  const metCount = passwordRulesPassed.filter((r) => r.met).length;
  const isPasswordValid = metCount === PASSWORD_RULES.length;
  const doPasswordsMatch = formData.password.length > 0 && formData.password === formData.confirmPassword;
  const isStep2Valid = isPasswordValid && doPasswordsMatch;

  const strengthColor = metCount <= 2 ? "bg-red-500" : metCount <= 4 ? "bg-amber-500" : "bg-emerald-500";
  const strengthLabel = metCount <= 2 ? "Weak" : metCount <= 4 ? "Medium" : "Strong";
  const strengthPercent = (metCount / PASSWORD_RULES.length) * 100;

  const handleNext = () => {
    if (step === 1) {
      if (!formData.firstName || !formData.lastName || !formData.email) {
        toast.error("Please fill in all required fields.");
        return;
      }
      if (!formData.termsAccepted) {
        toast.error("You must accept the terms to continue.");
        return;
      }
      setDirection(1);
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!isPasswordValid) {
      toast.error("Please ensure all password requirements are met.");
      return;
    }
    if (!doPasswordsMatch) {
      toast.error("Passwords do not match. Please verify them.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 🚀 Dynamically swap "other" for their typed text before saving
      const finalBusinessType = formData.businessType === "other" && formData.customBusinessType 
        ? formData.customBusinessType 
        : formData.businessType;

      const res = await signUpUser({ ...formData, businessType: finalBusinessType, plan: selectedPlan });

      if (!res.success) {
        toast.error(res.error || "An error occurred during sign up.");
        setIsSubmitting(false);
        return;
      }

      // Success! Move to email confirmation step
      setDirection(1);
      setStep(3);
    } catch (error) {
      toast.error("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  // 🎥 CINEMATIC 3D CAMERA TRANSITION
  const slideVariants = {
    hidden: (dir: number) => ({ 
      x: dir > 0 ? 150 : -150, 
      opacity: 0, 
      scale: 0.85,
      rotateY: dir > 0 ? 15 : -15 
    }),
    visible: { 
      x: 0, 
      opacity: 1, 
      scale: 1,
      rotateY: 0, 
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
    },
    exit: (dir: number) => ({ 
      x: dir > 0 ? -150 : 150, 
      opacity: 0, 
      scale: 0.85,
      rotateY: dir > 0 ? -15 : 15, 
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } 
    })
  };

  const inputClass = "h-14 px-5 text-base bg-white border-2 border-slate-200 text-slate-900 focus-visible:border-blue-600 focus-visible:ring-4 focus-visible:ring-blue-600/10 rounded-xl shadow-sm transition-all";

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50 overflow-hidden selection:bg-blue-500/30 font-sans p-4 sm:p-8">
      
      {/* 📐 Subtle Grid Background */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.4]"
        style={{
          backgroundImage: `linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* 🔮 Center Glowing Orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-[120px] z-0 pointer-events-none" />

      {/* 🚀 SMOOTH 3D FLOATING SYSTEM ICONS */}
      <div className="hidden lg:block absolute inset-0 z-10 pointer-events-none">
        {FLOATING_BADGES.map((badge) => {
          const Icon = badge.icon;
          return (
            <motion.div
              key={badge.id}
              className={`absolute flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl border ${badge.bg} ${badge.border} ${badge.shadow}`}
              style={badge.target as any}
              initial={badge.initial}
              animate={{ 
                x: step === 1 ? 0 : badge.parallax.x, 
                y: step === 1 ? 0 : badge.parallax.y, 
                opacity: 1, 
                scale: step === 1 ? 1 : 0.95 
              }}
              transition={{ type: "spring", stiffness: 60, damping: 12, delay: step === 1 ? badge.delay : 0 }}
            >
              <motion.div
                // 🚀 UPGRADED: Multi-axis fluid drifting for a natural 3D effect
                animate={{ 
                  y: [0, -14, 0], 
                  x: [0, 8, 0], 
                  rotate: [-2, 3, -2] 
                }}
                transition={{ 
                  duration: 6 + Math.random() * 3, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="flex items-center gap-2.5 w-full"
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-slate-50 border ${badge.border}`}>
                  <Icon className={`h-4 w-4 ${badge.color}`} />
                </div>
                <span className={`text-[10px] font-extrabold tracking-widest uppercase ${badge.color}`}>
                  {badge.label}
                </span>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Back to Home Button */}
      <Link href="/">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors cursor-pointer z-30"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Back to Home</span>
        </motion.div>
      </Link>

      {/* 📝 THE MAIN FORM CARD */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        className="w-full max-w-3xl bg-white/90 backdrop-blur-xl rounded-3xl sm:rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white relative z-20 flex flex-col"
      >
        {/* Top Progress Bar */}
        <div className="px-6 md:px-12 py-8 border-b border-slate-100 shrink-0 bg-white/50 rounded-t-[2rem]">
          <div className="flex items-center justify-center max-w-md mx-auto">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isCompleted = s.id < step;
              
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className={`flex flex-col items-center gap-2 ${isActive || isCompleted ? 'text-blue-600' : 'text-slate-300'}`}>
                    <motion.div 
                      animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                      transition={{ duration: 0.5 }}
                      className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : isCompleted ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}
                    >
                      <Icon className="h-5 w-5" />
                    </motion.div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{s.title}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 mx-4 flex items-center">
                      <div className={`h-1 w-full rounded-full transition-colors duration-500 ${isCompleted ? 'bg-blue-600' : 'bg-slate-100'}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 🛠️ Main Content Area - RESPONSIVE HEIGHT */}
        <div className="px-6 md:px-14 py-6 md:py-0 flex flex-col justify-center h-[65vh] min-h-[450px] md:h-[700px] overflow-x-hidden overflow-y-auto custom-scrollbar" style={{ perspective: "1200px" }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants as any}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full"
            >
              
              <div className="mb-8 md:mb-10 text-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight px-2">
                  {step === 1 && "Let's get to know you."}
                  {step === 2 && "Secure your account."}
                  {step === 3 && "Check your inbox."}
                </h1>
                <p className="text-slate-500 mt-4 text-lg max-w-lg mx-auto">
                  {step === 1 && "Tell us a bit about yourself to set up your profile."}
                  {step === 2 && "You'll use these credentials to access your dashboard."}
                  {step === 3 && `We sent a confirmation link to ${formData.email}.`}
                </p>
              </div>

              <div className="space-y-10">
                {/* STEP 1: BASIC INFO */}
                {step === 1 && (
                  <div className="space-y-6 max-w-2xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">First Name *</Label>
                        <Input placeholder="" className={inputClass} value={formData.firstName} onChange={(e) => updateForm("firstName", e.target.value)} />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Last Name *</Label>
                        <Input placeholder="" className={inputClass} value={formData.lastName} onChange={(e) => updateForm("lastName", e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Work Email *</Label>
                      <Input type="email" placeholder="email@company.com" className={inputClass} value={formData.email} onChange={(e) => updateForm("email", e.target.value)} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone (Optional)</Label>
                        <div className="h-14 flex items-center bg-white border-2 border-slate-200 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10 rounded-xl shadow-sm transition-all">
                          <PhoneInput
                            defaultCountry="GB"
                            placeholder="Phone Number"
                            value={formData.phone}
                            onChange={(val) => updateForm("phone", val)}
                            className="w-full border-none shadow-none focus-visible:ring-0 px-2"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Location</Label>
                        <Select value={formData.location} onValueChange={(val) => updateForm("location", val)}>
                          <SelectTrigger className={inputClass}><SelectValue placeholder="Select country" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                            <SelectItem value="United States">United States</SelectItem>
                            <SelectItem value="Philippines">Philippines</SelectItem>
                            <SelectItem value="Australia">Australia</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 🚀 UPGRADED: Business Type and Language side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Business Type</Label>
                        <div className="space-y-2">
                          <Select value={formData.businessType} onValueChange={(val) => updateForm("businessType", val)}>
                            <SelectTrigger className={inputClass}><SelectValue placeholder="Select industry" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="technology">Technology & Software</SelectItem>
                              <SelectItem value="consulting">Consulting & Agency</SelectItem>
                              <SelectItem value="retail">Retail & Ecommerce</SelectItem>
                              <SelectItem value="other">Other (Please specify)</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          {/* 🚀 Pops out beautifully when they select "Other" */}
                          <AnimatePresence>
                            {formData.businessType === "other" && (
                              <motion.div
                                initial={{ opacity: 0, height: 0, y: -10 }}
                                animate={{ opacity: 1, height: "auto", y: 0 }}
                                exit={{ opacity: 0, height: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <Input 
                                  placeholder="e.g. Graphic Design" 
                                  className={`${inputClass} mt-1 border-blue-200 bg-blue-50/50`} 
                                  value={formData.customBusinessType} 
                                  onChange={(e) => updateForm("customBusinessType", e.target.value)} 
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Language</Label>
                        <Select value={formData.language} onValueChange={(val) => updateForm("language", val)}>
                          <SelectTrigger className={inputClass}><SelectValue placeholder="Select a language" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English (US)</SelectItem>
                            <SelectItem value="es">Español (Spanish)</SelectItem>
                            <SelectItem value="fr">Français (French)</SelectItem>
                            <SelectItem value="tl">Tagalog (Filipino)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 pt-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <Checkbox id="terms" className="h-5 w-5" checked={formData.termsAccepted} onCheckedChange={(val) => updateForm("termsAccepted", val === true)} />
                      <label htmlFor="terms" className="text-sm text-slate-600 font-medium leading-tight">
                        I have read and agree to the <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
                      </label>
                    </div>
                  </div>
                )}

                {/* STEP 2: PASSWORD */}
                {step === 2 && (
                  <div className="space-y-8 max-w-xl mx-auto">
                    <motion.div 
                      className="p-8 sm:p-10 bg-white rounded-[2rem] border-2 border-blue-100 relative overflow-hidden shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-orange-50/30 z-0"></div>
                      <div className="space-y-6 relative z-10">
                        
                        <div className="space-y-3">
                          <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Secure Password</Label>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="••••••••" 
                              className={inputClass}
                              value={formData.password} 
                              onChange={(e) => updateForm("password", e.target.value)} 
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>

                          {/* 🚀 Dynamic Password Strength Meter */}
                          {formData.password.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                                <span>Password strength</span>
                                <span className={cn(
                                  metCount <= 2 ? "text-red-600" : metCount <= 4 ? "text-amber-600" : "text-emerald-600"
                                )}>
                                  {strengthLabel}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={cn("h-full transition-all duration-300 rounded-full", strengthColor)}
                                  style={{ width: `${strengthPercent}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* 🚀 Requirement Checklist */}
                          <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl bg-slate-50/80 p-3.5 border border-slate-200/60 text-xs">
                            {passwordRulesPassed.map((rule) => (
                              <div key={rule.id} className="flex items-center gap-2">
                                {rule.met ? (
                                  <Check className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                ) : (
                                  <div className="h-3.5 w-3.5 rounded-full border border-slate-300 flex-shrink-0" />
                                )}
                                <span className={cn("transition-colors", rule.met ? "text-slate-900 font-medium" : "text-slate-500")}>
                                  {rule.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-3 pt-2">
                          <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Confirm Password</Label>
                          <div className="relative">
                            <Input 
                              type={showConfirmPassword ? "text" : "password"} 
                              placeholder="••••••••" 
                              className={inputClass}
                              value={formData.confirmPassword} 
                              onChange={(e) => updateForm("confirmPassword", e.target.value)} 
                            />
                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">
                              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>

                          {/* 🚀 Match Indicator */}
                          {formData.confirmPassword.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-medium pt-1">
                              {doPasswordsMatch ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                  <span className="text-emerald-600">Passwords match</span>
                                </>
                              ) : (
                                <>
                                  <X className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                  <span className="text-red-500">Passwords do not match</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    </motion.div>
                  </div>
                )}

                {/* STEP 3: SUCCESS / CHECK EMAIL */}
                {step === 3 && (
                  <motion.div className="flex flex-col items-center justify-center text-center py-8">
                    <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center border-4 border-green-100 mb-8 shadow-lg shadow-green-100">
                      <MailCheck className="h-12 w-12 text-green-600" />
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-slate-600 w-full max-w-md shadow-inner">
                      <p className="font-medium mb-2">Once you verify your email, you will be redirected automatically to configure your workspace.</p>
                      <p className="text-sm text-slate-400">Don't see it? Check your spam folder.</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Footer Actions (Hidden on final success step) */}
        {step < 3 && (
          <div className="px-6 md:px-12 py-6 md:py-8 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-between items-center gap-4 sm:gap-0 z-10 rounded-b-3xl sm:rounded-b-[2rem] shrink-0">
            <Button 
              variant="ghost" 
              onClick={handleBack} 
              className={`w-full sm:w-auto h-14 px-6 text-lg font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              Back
            </Button>
            
            {step === 1 ? (
              <Button 
                onClick={handleNext} 
                className="w-full sm:w-auto h-14 px-10 text-lg bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-[0_8px_20px_-6px_rgba(37,99,235,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                Continue securely <ChevronRight className="ml-2 h-6 w-6" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting || !isStep2Valid} 
                className="w-full sm:w-auto h-14 px-10 text-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-[0_8px_20px_-6px_rgba(249,115,22,0.4)] transition-all hover:shadow-[0_12px_24px_-6px_rgba(249,115,22,0.6)] hover:-translate-y-0.5"
              >
                {isSubmitting ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : null}
                {isSubmitting ? "Creating Profile..." : "Create Account"}
              </Button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}