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

export type UseCacheProbeRequestSnapshot = {
  headers: [string, string][];
  cookieHeader: string | undefined;
  urlPathname: string;
  urlSearch: string;
  rootParams: Record<string, unknown>;
  isDraftMode: boolean;
  isHmrRefresh: boolean;
};

export type UseCacheProbe = (msg: {
  id: string;
  kind: string;
  encodedArguments: string | FormData;
  request: UseCacheProbeRequestSnapshot;
  timeoutMs: number;
}) => Promise<boolean>;

export function setUseCacheProbe(fn: UseCacheProbe | undefined): void {
  (globalThis as Record<symbol, unknown>)[SYMBOL] = fn;
}

export function getUseCacheProbe(): UseCacheProbe | undefined {
  return (globalThis as Record<symbol, unknown>)[SYMBOL] as UseCacheProbe | undefined;
}
