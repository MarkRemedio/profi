import { cn } from "@/lib/utils";

export function AboutHero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-32 pb-16 md:px-8 lg:pt-40 lg:pb-24">
      <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
        
        {/* Top Accent */}
        <div className="flex items-center gap-3">
          <span className="h-[1px] w-6 bg-blue-600" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 font-mono">
            Front Page &middot; About Us
          </span>
        </div>

        {/* Giant Headline */}
        <h1 className="text-6xl md:text-[6rem] lg:text-[7.5rem] font-medium tracking-tight text-[#111111] leading-[0.95]">
          Accounting Built <br />
          Around <span className="text-blue-600 italic">Real</span> <br />
          <span className="text-blue-600 italic">People.</span>
        </h1>

        {/* Bottom Split Details */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-12 pt-8 border-t border-transparent">
          
          {/* Left Metadata */}
          <div className="flex flex-col gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">
            <p>EST. 2024</p>
            <p>LONDON &middot; EDINBURGH</p>
            <p>B CORP IN PROGRESS</p>
            <p>BACKED BY YC FINTECH &middot; 24%</p>
          </div>

          {/* Right Description */}
          <div className="max-w-md">
            <p className="text-lg md:text-xl font-medium text-slate-700 leading-relaxed">
              Accounting should feel like nothing. In the moment you need it, everything should be clear.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}