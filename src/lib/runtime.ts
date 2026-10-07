/**
 * True in the standalone demo build (scripts/build-standalone.mjs): a single
 * self-contained page with no server, where the demo panel runs in the browser.
 */
export const STANDALONE = process.env.NEXT_PUBLIC_STANDALONE_DEMO === "1";
