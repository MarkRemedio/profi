import { BankingDashboardSkeleton } from "@/components/banking/skeletons";

export default function BankingLoading() {
  return (
    <div className="w-full">
      <BankingDashboardSkeleton />
    </div>
  );
}
