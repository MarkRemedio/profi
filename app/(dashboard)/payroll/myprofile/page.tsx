import { MyProfile } from "@/components/payroll/myprofile";
import { Suspense } from "react";

export default function MyProfilePage() {
  return (
    <Suspense fallback={null}>
      <MyProfile />
    </Suspense>
  );
}
