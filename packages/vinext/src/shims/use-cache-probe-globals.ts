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
const INSIDE_PROBE_SYMBOL = Symbol.for("vinext.dev.useCacheProbe.inside");

export type UseCacheProbeRequestSnapshot = {
  headers: [string, string][];
  urlPathname: string;
  urlSearch: string;
  rootParams: Record<string, string | string[] | undefined>;
};

export type UseCacheProbe = (msg: {
  id: string;
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

export function setInsideUseCacheProbe(value: boolean): void {
  const current = ((globalThis as Record<symbol, unknown>)[INSIDE_PROBE_SYMBOL] as number) || 0;
  (globalThis as Record<symbol, unknown>)[INSIDE_PROBE_SYMBOL] = value
    ? current + 1
    : Math.max(0, current - 1);
}

export function isInsideUseCacheProbe(): boolean {
  return (((globalThis as Record<symbol, unknown>)[INSIDE_PROBE_SYMBOL] as number) || 0) > 0;
}
