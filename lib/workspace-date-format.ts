export const WORKSPACE_DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

export type WorkspaceDateFormat = (typeof WORKSPACE_DATE_FORMATS)[number];

export const WORKSPACE_DATE_FORMAT_OPTIONS: ReadonlyArray<{
  value: WorkspaceDateFormat;
  label: string;
  example: string;
}> = [
  { value: "DD/MM/YYYY", label: "UK / EU", example: "04/07/2026" },
  { value: "MM/DD/YYYY", label: "US format", example: "07/04/2026" },
  { value: "YYYY-MM-DD", label: "ISO standard", example: "2026-07-04" },
];

export function isWorkspaceDateFormat(value: string): value is WorkspaceDateFormat {
  return WORKSPACE_DATE_FORMATS.some((format) => format === value);
}

export function normaliseWorkspaceDateFormat(
  value: string | null | undefined,
): WorkspaceDateFormat {
  return value && isWorkspaceDateFormat(value) ? value : "YYYY-MM-DD";
}
