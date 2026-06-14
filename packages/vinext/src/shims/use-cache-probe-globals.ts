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
  urlPathname: string;
  urlSearch: string;
  rootParams: Record<string, string | string[] | undefined>;
  draftModeSecret?: string;
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
  kind: string;
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
