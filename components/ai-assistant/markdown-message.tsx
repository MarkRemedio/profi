"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const richTextSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u"],
};

export function MarkdownMessage({ content, inverted = false }: { content: string; inverted?: boolean }) {
  return (
    <div className={cn("min-w-0 text-xs leading-relaxed", inverted && "text-white")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, richTextSchema]]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2.5 text-xs font-bold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          u: ({ children }) => <u className="decoration-1 underline-offset-2">{children}</u>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className={cn("my-2 border-l-2 pl-3 italic", inverted ? "border-white/50 text-white/90" : "border-blue-300 text-muted-foreground")}>
              {children}
            </blockquote>
          ),
          hr: () => <hr className={cn("my-3", inverted ? "border-white/25" : "border-border")} />,
          a: ({ href, children }) => {
            const safeInternal = Boolean(href?.startsWith("/") && !href.startsWith("//") && !href.includes("\\"));
            if (!safeInternal) return <span className="font-medium underline decoration-dotted underline-offset-2">{children}</span>;
            return (
              <a href={href} className={cn("font-medium underline underline-offset-2", inverted ? "text-white" : "text-blue-700 hover:text-blue-800")}>
                {children}
              </a>
            );
          },
          code: ({ className, children, ...props }) => {
            const block = Boolean(className?.startsWith("language-"));
            return block ? (
              <code className={cn("block whitespace-pre-wrap text-[11px]", className)} {...props}>{children}</code>
            ) : (
              <code className={cn("rounded px-1 py-0.5 font-mono text-[11px]", inverted ? "bg-white/15" : "bg-slate-200/70 text-slate-800")} {...props}>{children}</code>
            );
          },
          pre: ({ children }) => <pre className={cn("my-2 max-w-full overflow-x-auto rounded-lg p-2.5", inverted ? "bg-black/20" : "bg-slate-900 text-slate-50")}>{children}</pre>,
          table: ({ children }) => (
            <div className="my-2 max-w-full overflow-x-auto rounded-lg border">
              <table className="w-full min-w-64 border-collapse text-left text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className={inverted ? "bg-white/10" : "bg-muted"}>{children}</thead>,
          th: ({ children }) => <th className="border-b px-2 py-1.5 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b px-2 py-1.5 align-top last:border-b-0">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
