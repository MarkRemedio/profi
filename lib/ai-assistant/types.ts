export type AiCitation = {
  id: string;
  label: string;
  href: string;
  type: "invoice" | "bill" | "contact" | "journal" | "bank_transaction" | "report" | "vat" | "account" | "guide";
};

export type AiPageContext = {
  path: string;
  label: string;
  module: string;
};

export type AiConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations: AiCitation[];
  createdAt: string;
};

export type AiConversationDetail = AiConversationSummary & {
  messages: AiChatMessage[];
};
