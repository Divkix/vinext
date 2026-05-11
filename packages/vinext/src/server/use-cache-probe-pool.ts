/**
 * use-cache-probe-pool.ts
 *
 * Manages isolated ModuleRunners for "use cache" deadlock probes.
 *
 * In dev mode, when a cache fill appears stuck, we re-run the same cache
 * function in a fresh module graph. If it completes there but the main fill
 * is still hung, the hang is attributable to module-scope shared state
 * (e.g. a top-level Map used to dedupe fetches) from the outer render.
 *
 * Unlike Next.js (which uses jest-worker with real OS processes), vinext
 * creates a fresh Vite ModuleRunner per probe. Each runner has its own
 * EvaluatedModules instance, so top-level module state is recreated from
 * scratch while still using the same Vite transform pipeline.
 *
 * The pool is torn down on HMR / file invalidation so the next probe
 * starts with fresh transformed code.
 */

import type { DevEnvironment } from "vite";
import { createDirectRunner, type DevEnvironmentLike } from "./dev-module-runner.js";
import type { ModuleRunner } from "vite/module-runner";
import { setUseCacheProbe, setInsideUseCacheProbe } from "vinext/shims/use-cache-probe-globals";
import { UseCacheTimeoutError } from "vinext/shims/use-cache-errors";

let _probeEnvironment: DevEnvironmentLike | DevEnvironment | null = null;

/**
 * Initialize the probe pool with the Vite dev environment.
 *
 * Called once during configureServer() when the App Router dev server starts.
 */
export function initUseCacheProbePool(environment: DevEnvironmentLike | DevEnvironment): void {
  if (_probeEnvironment) {
    // Already initialized — no-op. The environment is the same for the
    // lifetime of the dev server.
    return;
  }
  _probeEnvironment = environment;

  setUseCacheProbe(async (msg) => {
    // Create a fresh runner per probe so the module graph is completely
    // isolated from previous probes. Reusing runners would leave stale
    // top-level state in EvaluatedModules.
    // createDirectRunner creates a fresh ModuleRunner with its own isolated
    // EvaluatedModules instance, which is exactly what we need for probes.
    const runner = createDirectRunner(_probeEnvironment!);
    const { id, kind, encodedArguments, request, timeoutMs } = msg;

    // Internal timeout so the probe aborts before the outer render timeout.
    const deadline = Date.now() + timeoutMs;

    setInsideUseCacheProbe(true);
    try {
      // Import the cache-runtime shim in the isolated runner.
      // The shim's registerCachedFunction will create fresh module-scope state.
      const cacheRuntime = (await runner.import("vinext/shims/cache-runtime")) as Record<
        string,
        unknown
      >;
      const registerCachedFunction = cacheRuntime.registerCachedFunction as
        | (<T extends (...args: unknown[]) => Promise<unknown>>(
            fn: T,
            id: string,
            variant?: string,
          ) => T)
        | undefined;

      if (!registerCachedFunction) {
        return false;
      }

      // We need to locate the original cached function module in the isolated
      // runner. The function id is "<modulePath>:<exportName>". We split it
      // to find the module and the export.
      const lastColon = id.lastIndexOf(":");
      const modulePath = lastColon >= 0 ? id.slice(0, lastColon) : id;
      const exportName = lastColon >= 0 ? id.slice(lastColon + 1) : "default";

      // Import the module containing the original "use cache" function.
      const mod = (await runner.import(modulePath)) as Record<string, unknown>;
      const originalFn = mod[exportName];
      if (typeof originalFn !== "function") {
        return false;
      }

      // Wrap it with registerCachedFunction so the probe runs through the
      // same cache-runtime path (fresh ALS, no shared state).
      const variant = kind === "private" ? "private" : "";
      const wrapped = registerCachedFunction(
        originalFn as (...args: unknown[]) => Promise<unknown>,
        id,
        variant,
      );

      // Decode the arguments (simple JSON fallback; RSC encodeReply is
      // not available in the probe because we lack the client environment).
      // For deadlock detection, the exact argument values matter less than
      // the fact that the function body executes with a fresh module scope.
      let args: unknown[] = [];
      if (typeof encodedArguments === "string") {
        try {
          args = JSON.parse(encodedArguments);
          if (!Array.isArray(args)) args = [args];
        } catch {
          args = [];
        }
      }

      // Run the function with a reconstructed request store so private caches
      // that read cookies()/headers()/draftMode() see the same values.
      // Race against the internal timeout.
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return false;
      }

      await Promise.race([
        runWithProbeRequestStore(runner, request, async () => wrapped(...args)),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new UseCacheTimeoutError()), remaining);
          // Ensure timer is cleaned up on success via unref if available.
          if (typeof (t as NodeJS.Timeout).unref === "function") {
            (t as NodeJS.Timeout).unref();
          }
        }),
      ]);

      return true;
    } catch {
      // Probe failure is inconclusive — the function might genuinely hang
      // even in isolation, or the module import failed. Fall back to the
      // regular timeout.
      return false;
    } finally {
      setInsideUseCacheProbe(false);
      runner.close().catch(() => {});
    }
  });
}

/**
 * Tear down the probe pool. Called on HMR / file invalidation so the next
 * probe starts with fresh code.
 */
export function tearDownUseCacheProbePool(): void {
  _probeEnvironment = null;
  setUseCacheProbe(undefined);
}

/**
 * Reconstruct a minimal request store in the probe runner so that
 * cookies(), headers(), and draftMode() behave correctly.
 */
async function runWithProbeRequestStore<T>(
  runner: ModuleRunner,
  requestSnapshot: {
    headers: [string, string][];
    cookieHeader: string | undefined;
    urlPathname: string;
    urlSearch: string;
    rootParams: Record<string, unknown>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  // Import the ALS-backed request-context modules through the probe runner
  // so they load inside the isolated module graph, not the main runner's.
  const { createRequestContext, runWithRequestContext } = (await runner.import(
    "vinext/shims/unified-request-context",
  )) as typeof import("vinext/shims/unified-request-context");

  const { headersContextFromRequest } = (await runner.import(
    "vinext/shims/headers",
  )) as typeof import("vinext/shims/headers");

  // Build a Request from the snapshot so headersContextFromRequest works.
  const url = new URL(requestSnapshot.urlPathname + requestSnapshot.urlSearch, "http://localhost");
  const request = new Request(url, {
    headers: new Headers(requestSnapshot.headers),
  });

  const headersContext = headersContextFromRequest(request);
  const ctx = createRequestContext({
    headersContext,
    executionContext: null,
    rootParams: requestSnapshot.rootParams as Record<string, string | string[]>,
  });

  return runWithRequestContext(ctx, fn);
}
