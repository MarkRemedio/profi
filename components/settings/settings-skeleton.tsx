import { Skeleton } from "@/components/ui/skeleton";

// 👥 1. PROFILE & ACCESS SKELETON (Perfect UI Match)
export function ProfileAccessSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      {/* Header & Tab Switcher Skeleton */}
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-5">
        <Skeleton className="h-8 w-[250px]" />
        <Skeleton className="h-4 w-[450px] max-w-full" />

        {/* Mocking the Owner Tab Switcher */}
        <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl w-fit mt-4">
          <Skeleton className="h-8 w-[100px] rounded-lg bg-white" />
          <Skeleton className="h-8 w-[180px] rounded-lg" />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
        {/* Left Form: Personal Account Identity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <Skeleton className="h-5 w-[200px] mb-2" />

          {/* First Name & Last Name Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-[80px]" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-[80px]" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>

          {/* Email Address Row */}
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-[160px]" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-3 w-[250px] mt-1.5" />
          </div>

          {/* Save Button Row */}
          <div className="pt-6 mt-4 border-t border-slate-100 flex justify-end">
            <Skeleton className="h-10 w-[150px] rounded-xl" />
          </div>
        </div>

        {/* Right Card: Credential Control */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <Skeleton className="h-5 w-[140px]" />
            <Skeleton className="h-3 w-[90%] mt-2" />
            <Skeleton className="h-3 w-[70%] mt-1" />
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center space-y-3 flex flex-col items-center">
            {/* Key Icon Mockup */}
            <Skeleton className="size-9 rounded-full bg-blue-100" />

            {/* Text Description Mockup */}
            <div className="w-full flex flex-col items-center space-y-2 pt-1">
              <Skeleton className="h-4 w-[160px]" />
              <Skeleton className="h-2 w-[180px]" />
              <Skeleton className="h-2 w-[150px]" />
            </div>

            {/* Action Button Mockup */}
            <Skeleton className="h-9 w-full rounded-xl mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}

// 💳 2. BILLING SKELETON (Perfect UI Match)
export function BillingSettingsSkeleton() {
  return (
    <div className="w-full space-y-8 animate-in fade-in-50 duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <Skeleton className="h-8 w-[200px] sm:w-[250px]" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-[80%] max-w-lg" />
        </div>
      </div>

      {/* Main Billing Card */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        {/* Top Half: Plan Summary & Button */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <Skeleton className="h-3 w-[100px] mb-3" />
            <div className="flex items-end gap-3">
              <Skeleton className="h-9 w-[180px]" />
              <Skeleton className="h-6 w-[120px] mb-1" />
            </div>
            <div className="mt-5">
              <Skeleton className="h-6 w-[150px] rounded-full" />
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <Skeleton className="h-11 w-full rounded-xl sm:w-[190px]" />
            <Skeleton className="h-11 w-full rounded-xl sm:w-[170px]" />
          </div>
        </div>

        {/* Bottom Half: Details */}
        <div className="bg-slate-50/50 p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div className="space-y-3">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-6 w-[180px]" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-[130px]" />
            <Skeleton className="h-5 w-[200px]" />
          </div>
        </div>
      </div>

      {/* Invoice History Section */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8">
        {/* Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <Skeleton className="h-4 w-[120px] shrink-0" />
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Skeleton className="h-9 w-full sm:w-64 rounded-lg" />
            <Skeleton className="h-9 w-full sm:w-[140px] rounded-lg shrink-0" />
          </div>
        </div>

        {/* Invoice Table Rows */}
        <div className="flex flex-col">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`flex items-center justify-between py-4 ${i !== 5 ? "border-b border-slate-100" : ""}`}
            >
              <div className="flex items-center gap-4 sm:gap-8 w-full overflow-hidden">
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="hidden sm:block h-5 w-16 rounded-md shrink-0" />
                <Skeleton className="h-4 w-full max-w-[220px]" />
              </div>
              <Skeleton className="size-8 rounded-lg ml-4 shrink-0" />
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <Skeleton className="h-4 w-[220px]" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-[70px] rounded-md" />
            <Skeleton className="h-8 w-[70px] rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

// 🔒 3. SECURITY SKELETON (Smart Active Tab Matching!)
export function SecuritySettingsSkeleton({ activeTab = "2fa" }: { activeTab?: string }) {
  return (
    <div className="w-full animate-in fade-in-50 duration-500">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg shrink-0" />
          <Skeleton className="h-9 w-[220px]" />
        </div>
        <Skeleton className="h-4 w-[450px] max-w-full mt-3" />
      </div>

      {/* Tabs List Skeletons */}
      <div className="h-14 bg-slate-100/50 p-1.5 rounded-2xl w-[400px] max-w-full mb-6 flex gap-2">
        <Skeleton
          className={`flex-1 h-full rounded-xl ${activeTab === "2fa" ? "bg-white shadow-sm" : "bg-slate-200/50"}`}
        />
        <Skeleton
          className={`flex-1 h-full rounded-xl ${activeTab === "questions" ? "bg-white shadow-sm" : "bg-slate-200/50"}`}
        />
      </div>

      {/* Render 2FA Skeleton or Questions Skeleton based on activeTab */}
      {activeTab === "questions" ? (
        /* 🚀 RECOVERY QUESTIONS TAB SKELETON */
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm overflow-hidden w-full space-y-6">
          <div className="flex items-start gap-4 mb-8">
            <Skeleton className="size-12 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-[220px]" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
          </div>

          {/* Question Box 1 */}
          <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100 w-full">
            <Skeleton className="h-3 w-[140px]" />
            <Skeleton className="h-12 w-full rounded-xl bg-white" />
            <Skeleton className="h-12 w-full rounded-xl bg-white" />
          </div>

          {/* Question Box 2 */}
          <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100 w-full">
            <Skeleton className="h-3 w-[140px]" />
            <Skeleton className="h-12 w-full rounded-xl bg-white" />
            <Skeleton className="h-12 w-full rounded-xl bg-white" />
          </div>

          {/* Bottom Action Bar */}
          <div className="pt-4 flex items-center justify-between w-full">
            <Skeleton className="h-4 w-[260px]" />
            <Skeleton className="h-12 w-[160px] rounded-xl" />
          </div>
        </div>
      ) : (
        /* 🚀 2FA TAB SKELETON */
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm overflow-hidden w-full space-y-8">
          <div className="flex flex-col sm:flex-row gap-6 justify-between items-start w-full">
            <div className="space-y-3 flex-1 w-full">
              <Skeleton className="h-6 w-[200px]" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-[80%] max-w-xl" />
            </div>

            <div className="flex items-center gap-3 shrink-0 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
              <Skeleton className="h-4 w-[50px]" />
              <Skeleton className="h-5 w-[36px] rounded-full" />
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 w-full">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-8 items-center w-full">
              <div className="shrink-0 bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center gap-3">
                <Skeleton className="size-32 rounded-lg" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex-1 space-y-8 w-full">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full shrink-0" />
                    <Skeleton className="h-5 w-[140px]" />
                  </div>
                  <Skeleton className="h-4 w-[280px] ml-8" />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full shrink-0" />
                    <Skeleton className="h-5 w-[150px]" />
                  </div>
                  <div className="ml-8 flex gap-3">
                    <Skeleton className="h-12 w-32 rounded-lg" />
                    <Skeleton className="h-12 w-[160px] rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
