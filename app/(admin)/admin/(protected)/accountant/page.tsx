import { MasterAccountant } from "@/components/admin/accountant";
import { getAccountantDirectory } from "./actions";

export const metadata = { title: "Accountant | Admin" };

export default async function AdminAccountantPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  // getAccountantDirectory asserts the `accountant` permission itself.
  const { clients, accountants, plans } = await getAccountantDirectory();

  return (
    <MasterAccountant
      clients={clients}
      accountants={accountants}
      plans={plans}
      initialCreate={action === "create"}
    />
  );
}
