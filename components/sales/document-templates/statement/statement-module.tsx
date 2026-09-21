import { FileSpreadsheet } from "lucide-react";
import type { DocumentModule } from "../types";
import { STATEMENT_DEFAULTS, type StatementTemplateConfig } from "./statement-config";
import { StatementEditor } from "./statement-editor";
import { StatementPreview } from "./statement-preview";
import { StatementDocument, type StatementDocumentData } from "./statement-document";

export const statementModule: DocumentModule<StatementTemplateConfig, StatementDocumentData> = {
  id: "statement",
  kind: "statement",
  label: "Statement",
  icon: FileSpreadsheet,
  defaults: STATEMENT_DEFAULTS,
  Editor: StatementEditor,
  Preview: StatementPreview,
  Document: StatementDocument,
};
