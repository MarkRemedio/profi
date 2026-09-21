export const TRACKING_DIMENSION_KEYS = [
  "class",
  "location",
  "custom_1",
  "custom_2",
  "custom_3",
] as const;

export type TrackingDimensionKey = (typeof TRACKING_DIMENSION_KEYS)[number];

export type TrackingOptionDto = {
  id: string;
  name: string;
  isActive: boolean;
};

export type TrackingDimensionDto = {
  id: string;
  key: TrackingDimensionKey;
  label: string;
  position: number;
  isActive: boolean;
  options: TrackingOptionDto[];
};

export type InvoiceTrackingSettingsDto = {
  enabled: boolean;
  dimensions: TrackingDimensionDto[];
};

export type TrackingAssignmentInput = {
  dimensionId: string;
  optionId: string;
};

export type TrackingAssignmentDto = TrackingAssignmentInput & {
  dimensionKey: TrackingDimensionKey;
  dimensionLabel: string;
  optionName: string;
};

export type SaveTrackingDimensionInput = {
  key: TrackingDimensionKey;
  label: string;
  options: string[];
};

export type SaveInvoiceTrackingSettingsInput = {
  enabled: boolean;
  dimensions: SaveTrackingDimensionInput[];
};

export function normalizeTrackingSettingsInput(input: SaveInvoiceTrackingSettingsInput) {
  const byKey = new Map(input.dimensions.map((dimension) => [dimension.key, dimension]));

  return TRACKING_DIMENSION_KEYS.map((key, position) => {
    const source = byKey.get(key);
    const builtIn = key === "class" || key === "location";
    const fallbackLabel = key === "class" ? "Class" : key === "location" ? "Location" : "";
    const requestedLabel = (builtIn ? fallbackLabel : source?.label ?? "").trim();
    if (requestedLabel.length > 40) throw new Error("Tracking field names cannot exceed 40 characters.");

    const seen = new Set<string>();
    const options = (source?.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean)
      .filter((option) => {
        const normalized = option.toLocaleLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });

    if (options.some((option) => option.length > 80)) {
      throw new Error("Tracking values cannot exceed 80 characters.");
    }
    if (options.length > 100) {
      throw new Error("A tracking field can have at most 100 selectable values.");
    }

    return {
      key,
      label: requestedLabel || fallbackLabel || `Custom ${position - 1}`,
      position,
      isActive: builtIn || Boolean(requestedLabel),
      options,
    };
  });
}
