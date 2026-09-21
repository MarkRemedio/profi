import { LandingNav } from "@/components/marketing/landing-nav";
import { Footer } from "@/components/marketing/footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // 1. Removed "overflow-x-hidden" from this outer container
    <div className="min-h-screen bg-[#f8f9ff] text-slate-950">
      <LandingNav />

      {/* 2. Removed overflow-x-hidden so GSAP scroll pinning works perfectly! */}
      <main className="flex-1 w-full">{children}</main>

      <Footer />
    </div>
  );
}
