import { POSCustomers } from "@/components/pos/customers";
import { Suspense } from "react";

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <POSCustomers />
    </Suspense>
  );
}
