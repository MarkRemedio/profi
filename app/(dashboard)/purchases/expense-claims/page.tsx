import { ExpenseClaimsUI } from "@/components/purchases/expense-claims";

/**
 * The workspace is resolved inside the claim actions via requireAccountantRole,
 * which honours impersonation and checks the caller's role.
 *
 * This page used to look the organisation up itself — first membership found —
 * and pass the id down, duplicating that logic without the role check and
 * picking an arbitrary workspace for anyone who belongs to more than one.
 */
export default async function ExpenseClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  return <ExpenseClaimsUI initialCreate={action === "create"} />;
}
