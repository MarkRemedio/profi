/**
 * One reader for every logo upload in the product.
 *
 * There were three of these — sales settings, purchases settings and the
 * onboarding wizard — and two of them checked nothing at all: a bare
 * FileReader behind an `accept="image/*"` attribute, which is a filter on the
 * file dialog rather than a rule. Anyone who switched the dialog to "All
 * files" could put a 40 MB video in a template logo, and it would be read into
 * a base64 string, held in React state, rendered into the preview and pushed
 * at storage before anything noticed.
 */

/** The largest file worth accepting for something drawn at 32 to 64 pixels. */
export const MAX_LOGO_MB = 2;

/**
 * Validate a picked file and read it as a data URL.
 *
 * Rejects by throwing, with a message written to be shown to the reader as-is:
 * every caller here is a toast, and "Invalid file" tells somebody nothing about
 * what to do next.
 */
export function readLogoFile(file: File, maxSizeMb = MAX_LOGO_MB): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("That is not an image. Try a PNG, SVG or JPG."));
  }

  if (file.size > maxSizeMb * 1024 * 1024) {
    return Promise.reject(
      new Error(
        `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${maxSizeMb} MB.`
      )
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read. Try another one."));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
