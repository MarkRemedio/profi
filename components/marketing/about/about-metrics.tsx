export function AboutMetrics() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8">
      <div className="border-y border-slate-200 py-10 animate-in fade-in duration-1000 delay-300 fill-mode-both">
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 md:gap-y-0 divide-x-0 md:divide-x divide-slate-200">
          
          <div className="flex flex-col gap-2 md:pr-8">
            <h3 className="text-4xl font-medium text-slate-950">12,480+</h3>
            <p className="text-xs font-medium text-slate-500">UK businesses on the waitlist</p>
          </div>

          <div className="flex flex-col gap-2 md:px-8 border-l border-slate-200 md:border-none pl-6 md:pl-8">
            <h3 className="text-4xl font-medium text-slate-950">£0</h3>
            <p className="text-xs font-medium text-slate-500">Cost under £30k revenue</p>
          </div>

          <div className="flex flex-col gap-2 md:px-8">
            <h3 className="text-4xl font-medium text-slate-950">12 min</h3>
            <p className="text-xs font-medium text-slate-500">Median migration time</p>
          </div>

          <div className="flex flex-col gap-2 md:pl-8 border-l border-slate-200 md:border-none pl-6 md:pl-8">
            <h3 className="text-4xl font-medium text-slate-950">99.97%</h3>
            <p className="text-xs font-medium text-slate-500">Sync uptime last 90d</p>
          </div>

        </div>
        
      </div>
    </section>
  );
}