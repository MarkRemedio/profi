/**
 * Shared constants for the statement upload route. Deliberately free of both
 * "use client" and "server-only": the browser uploader and the Server Action
 * that reads the result both need these values, and a directive on either side
 * would turn the import into a cross-boundary reference rather than a value.
 */

/** Private bucket holding statements in transit. Objects are deleted once parsed. */
export const STATEMENT_BUCKET = "bank_statements";

/**
 * Vercel rejects serverless request bodies over 4.5 MB at the edge, before the
 * Server Action ever runs — the browser gets a 413 whose body isn't an RSC
 * payload, which React surfaces as the opaque "An unexpected response was
 * received from the server." No `bodySizeLimit` in next.config can raise this;
 * it is a platform limit, not a Next one.
 *
 * Anything at or above this threshold goes to storage first and reaches the
 * server as a path rather than as bytes.
 */
export const INLINE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

/** Hard ceiling on a statement we'll accept at all, on either route. */
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
