import type { DocumentModule } from "./types";
import { invoiceAdapterModules } from "./invoice-settings-adapter";
import { statementModule } from "./statement/statement-module";

// "bill" is intentionally absent — bill branding is configured under purchases
// settings, not the sales Document Template Workspace.
export const DOCUMENT_MODULES: DocumentModule[] = [
  ...invoiceAdapterModules,
  statementModule as DocumentModule,
];
