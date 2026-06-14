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
import { setUseCacheProbe } from "vinext/shims/use-cache-probe-globals";
import type { EncodedArgsForProbe } from "vinext/shims/use-cache-probe-globals";
import { UseCacheTimeoutError } from "vinext/shims/use-cache-errors";

let _probeEnvironment: DevEnvironmentLike | DevEnvironment | null = null;
const _activeProbeRunners = new Set<ModuleRunner>();

/**
 * Initialize the probe pool with the Vite dev environment.
 *
 * Called during configureServer() when the App Router dev server starts,
 * and re-called after each HMR teardown cycle.
 */
export function initUseCacheProbePool(environment: DevEnvironmentLike | DevEnvironment): void {
  if (_probeEnvironment === environment) {
    // Guard against double-init within the same cycle (e.g., if
    // initUseCacheProbePool is called without a preceding teardown).
    return;
  }
  if (_probeEnvironment) {
    tearDownUseCacheProbePool();
  }
  _probeEnvironment = environment;

  // Capture the environment in a local variable so the probe closure is
  // immune to HMR teardown setting _probeEnvironment = null mid-flight.
  const env = environment;

  setUseCacheProbe(async (msg) => {
    // Create a fresh runner per probe so the module graph is completely
    // isolated from previous probes. Reusing runners would leave stale
    // top-level state in EvaluatedModules.
    // createDirectRunner creates a fresh ModuleRunner with its own isolated
    // EvaluatedModules instance, which is exactly what we need for probes.
    const runner = createDirectRunner(env);
    _activeProbeRunners.add(runner);
    const { id, kind, encodedArguments, request, timeoutMs } = msg;

    // Internal timeout so the probe aborts before the outer render timeout.
    const deadline = performance.now() + timeoutMs;

    let probeTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
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
      // NOTE: This assumes export names don't contain colons.
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
      const variant = kind;
      const wrapped = registerCachedFunction(
        originalFn as (...args: unknown[]) => Promise<unknown>,
        id,
        variant,
      );

      // Decode args via the probe runner's RSC decodeReply so
      // thenable params/searchParams are reconstructed accurately.
      const args = await decodeProbeArgs(runner, encodedArguments);
      if (args === null) {
        return false;
      }

      // Run the function with a reconstructed request store so private caches
      // that read cookies()/headers()/draftMode() see the same values.
      // Mark the context as _probeDepth === 1 so nested 'use cache' calls
      // skip probe scheduling (mirrors Next.js useCacheProbeMode).
      // Race against the internal timeout.
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        return false;
      }

      await Promise.race([
        runWithProbeRequestStore(runner, request, async () => wrapped(...args)),
        new Promise<never>((_, reject) => {
          probeTimeoutTimer = setTimeout(() => reject(new UseCacheTimeoutError()), remaining);
          if (typeof (probeTimeoutTimer as NodeJS.Timeout).unref === "function") {
            (probeTimeoutTimer as NodeJS.Timeout).unref();
          }
        }),
      ]);

      return true;
    } catch {
      // Import, decode, request reconstruction, timeout, and user-function
      // errors are all inconclusive. Only a successful isolated completion
      // proves the outer fill is stuck on module-scoped state.
      return false;
    } finally {
      if (probeTimeoutTimer !== undefined) clearTimeout(probeTimeoutTimer);
      _activeProbeRunners.delete(runner);
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
  for (const runner of _activeProbeRunners) {
    runner.close().catch(() => {});
  }
  _activeProbeRunners.clear();
}

/**
 * Decode probe arguments from the wire-format `EncodedArgsForProbe` using
 * the probe runner's own RSC `decodeReply` so thenable params/searchParams
 * are reconstructed accurately.  Mirrors Next.js `use-cache-probe-worker.ts`.
 */
async function decodeProbeArgs(
  runner: ModuleRunner,
  encoded: EncodedArgsForProbe,
): Promise<unknown[] | null> {
  try {
    const rsc = (await runner.import("@vitejs/plugin-rsc/react/rsc")) as {
      createTemporaryReferenceSet: () => unknown;
      decodeReply: (
        data: string | FormData,
        options?: { temporaryReferences?: unknown },
      ) => Promise<unknown[]>;
    };
    const temporaryReferences = rsc.createTemporaryReferenceSet();

    if (encoded.kind === "string") {
      const decoded = await rsc.decodeReply(encoded.data, { temporaryReferences });
      if (!Array.isArray(decoded)) return [decoded];
      return decoded;
    }

    // formdata kind: reconstruct FormData from serialized entries.
    const formData = new FormData();
    for (const entry of encoded.entries) {
      if (entry.length === 2 && typeof entry[1] === "string") {
        formData.append(entry[0], entry[1]);
      } else {
        const blob = entry[1] as { kind: "blob"; bytes: string; type: string };
        const bytes = Buffer.from(blob.bytes, "base64");
        formData.append(entry[0], new File([bytes], "", { type: blob.type }));
      }
    }

    const decoded = await rsc.decodeReply(formData, { temporaryReferences });
    if (!Array.isArray(decoded)) return [decoded];
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Reconstruct a minimal request store in the probe runner so that
 * cookies(), headers(), and draftMode() behave correctly.
 */
async function runWithProbeRequestStore<T>(
  runner: ModuleRunner,
  requestSnapshot: {
    headers: [string, string][];
    urlPathname: string;
    urlSearch: string;
    rootParams: Record<string, string | string[] | undefined>;
    draftModeSecret?: string;
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

  const headersContext = headersContextFromRequest(request, {
    draftModeSecret: requestSnapshot.draftModeSecret,
  });
  const ctx = createRequestContext({
    headersContext,
    executionContext: null,
    rootParams: requestSnapshot.rootParams,
    _probeDepth: 1,
  });

  return runWithRequestContext(ctx, fn);
}
