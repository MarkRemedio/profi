import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import AdminOtpView from "@/components/admin/admin-otp-view";

export default async function AdminOtpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only a half-authenticated admin (password ok, code pending) belongs here.
  if (!user || !isPlatformAdmin(user)) {
    redirect("/admin/login");
  }

  return <AdminOtpView email={user.email ?? ""} />;
}
