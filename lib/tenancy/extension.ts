// lib/tenancy/extension.ts
import "server-only";
import { Prisma } from "@prisma/client";
import { getTenantContext } from "./context";
import { applyTenantScope } from "./scope";

export const tenancyExtension = Prisma.defineExtension({
  name: "tenancy",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scoped = applyTenantScope(model, operation, args as any, getTenantContext());
        return query(scoped);
      },
    },
  },
});
