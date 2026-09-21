"use client";

import { useEffect, useState } from "react";
import {
  fetchDocumentBrandingDB,
  saveDocumentBrandingDB,
} from "@/app/(dashboard)/sales/document-templates/actions";
import type { DocumentTemplateKind } from "../types";

/**
 * Load a template's branding blob and coerce it into a typed config; expose a
 * save. `coerce` is the module's defensive merge (e.g. mergeStatementDefaults),
 * so the hook stays generic across document types.
 */
export function useTemplateBranding<C>(
  orgId: string,
  kind: DocumentTemplateKind,
  coerce: (raw: unknown) => C
) {
  const [config, setConfig] = useState<C | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const raw = orgId ? await fetchDocumentBrandingDB(orgId, kind) : null;
        if (active) setConfig(coerce(raw));
      } catch (err) {
        console.error("Failed to load template branding:", err);
        if (active) setConfig(coerce(null)); // fall back to typed defaults
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // coerce is a stable module-level function; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, kind]);

  const save = async (next: C) => {
    setSaving(true);
    try {
      await saveDocumentBrandingDB(orgId, kind, next);
    } finally {
      setSaving(false);
    }
  };

  return { config, setConfig, save, saving, loading };
}
