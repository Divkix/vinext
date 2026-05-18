/**
 * use-cache-probe-globals.ts
 *
 * Dev-only cross-module handoff for the "use cache" deadlock probe.
 * Uses a Symbol.for on globalThis so the dev server can install the probe
 * without importing dev-only code into the production cache runtime.
 *
 * Ported from Next.js: packages/next/src/server/use-cache/use-cache-probe-globals.ts
 * https://github.com/vercel/next.js/blob/canary/packages/next/src/server/use-cache/use-cache-probe-globals.ts
 */

const SYMBOL = Symbol.for("vinext.dev.useCacheProbe");

// DEPRECATED: use UnifiedRequestContext._probeDepth instead.
// Kept for backwards compat so existing tests still compile.
// oxlint-disable-next-line no-unused-vars
const _INSIDE_PROBE_SYMBOL = Symbol.for("vinext.dev.useCacheProbe.inside");

export type UseCacheProbeRequestSnapshot = {
  headers: [string, string][];
  urlPathname: string;
  urlSearch: string;
  rootParams: Record<string, string | string[] | undefined>;
};

/** Wire-format for encoded probe arguments */
export type EncodedArgsForProbe =
  | { kind: "string"; data: string }
  | {
      kind: "formdata";
      entries: Array<[string, string] | [string, { kind: "blob"; bytes: string; type: string }]>;
    };

export type UseCacheProbe = (msg: {
  id: string;
  encodedArguments: EncodedArgsForProbe;
  request: UseCacheProbeRequestSnapshot;
  timeoutMs: number;
}) => Promise<boolean>;

export function setUseCacheProbe(fn: UseCacheProbe | undefined): void {
  (globalThis as Record<symbol, unknown>)[SYMBOL] = fn;
}

export function getUseCacheProbe(): UseCacheProbe | undefined {
  return (globalThis as Record<symbol, unknown>)[SYMBOL] as UseCacheProbe | undefined;
}

/**
 * @deprecated Use `getRequestContext()._probeDepth` instead.
 * Kept for backwards compatibility — now a no-op.
 */
export function setInsideUseCacheProbe(_value: boolean): void {
  // globalThis-based counter is deprecated because concurrent requests
  // share globalThis, causing cross-request interference.  The real guard
  // is UnifiedRequestContext._probeDepth.
}

/**
 * @deprecated Use `(getRequestContext()._probeDepth ?? 0) > 0` instead.
 * Kept for backwards compatibility — always returns false.
 */
export function isInsideUseCacheProbe(): boolean {
  // globalThis-based counter is deprecated because concurrent requests
  // share globalThis, causing cross-request interference.
  return false;
}
