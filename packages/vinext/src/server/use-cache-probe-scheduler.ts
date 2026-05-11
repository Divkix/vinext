/**
 * use-cache-probe-scheduler.ts
 *
 * Dev-only idle-deadline probe scheduler for "use cache" fills.
 *
 * Wraps the cache fill stream in a TransformStream and tracks chunk activity.
 * If the stream is idle for PROBE_THRESHOLD_MS (10s), schedules a probe that
 * re-runs the cache function in a fresh module scope. If the probe completes
 * while the main fill is still hung, the caller aborts the fill with a
 * UseCacheDeadlockError.
 *
 * Ported from Next.js: packages/next/src/server/use-cache/use-cache-probe-scheduler.ts
 * https://github.com/vercel/next.js/blob/canary/packages/next/src/server/use-cache/use-cache-probe-scheduler.ts
 */

import {
  getUseCacheProbe,
  type UseCacheProbeRequestSnapshot,
} from "vinext/shims/use-cache-probe-globals";

const PROBE_THRESHOLD_MS = 10_000;
const MIN_PROBE_BUDGET_MS = 3_000;

type CacheContextWithProbeFields = {
  readonly functionId: string;
  readonly handlerKind: string;
};

type SetupOptions = {
  cacheContext: CacheContextWithProbeFields;
  encodedArguments: string | FormData;
  /**
   * Absolute monotonic deadline (in performance.now() units) at which the
   * outer cache fill will be aborted by the dev render-timeout timer.
   */
  fillDeadlineAt: number;
  /**
   * Called once if the probe ran the cache function to completion in isolation
   * while the main fill was still pending.
   */
  onProbeCompleted: () => void;
  /**
   * AbortSignal that fires when the probe should stop watching (fill settled,
   * timeout fired, upstream cancel, etc.).
   */
  abortSignal: AbortSignal;
  /**
   * The outer request store snapshot so the probe can reconstruct cookies(),
   * headers(), draftMode(), etc. in the isolated run.
   */
  requestSnapshot: UseCacheProbeRequestSnapshot;
  /**
   * Cache stream to track. Each chunk resets the idle timer.
   */
  stream: ReadableStream<Uint8Array>;
};

/**
 * Schedule an idle-deadline probe over a cache fill stream (dev-only).
 *
 * Returns the input stream unchanged when scheduling should be skipped.
 */
export function setupProbeScheduler(opts: SetupOptions): ReadableStream<Uint8Array> {
  const {
    cacheContext,
    encodedArguments,
    fillDeadlineAt,
    stream,
    abortSignal,
    onProbeCompleted,
    requestSnapshot,
  } = opts;

  // Skip if the remaining budget is too short for a meaningful probe.
  if (fillDeadlineAt - performance.now() < PROBE_THRESHOLD_MS + MIN_PROBE_BUDGET_MS) {
    return stream;
  }

  const probe = getUseCacheProbe();
  if (!probe) {
    return stream;
  }

  let lastChunkAt = performance.now();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const startProbe = () => {
    if (abortSignal.aborted) {
      return;
    }

    const probeStartedAtChunk = lastChunkAt;
    // Reserve a 1s buffer so the probe's internal timeout fires before the
    // outer render timeout.
    const probeInternalTimeoutMs = fillDeadlineAt - performance.now() - 1_000;

    if (probeInternalTimeoutMs <= 0) {
      return;
    }

    probe({
      id: cacheContext.functionId,
      kind: cacheContext.handlerKind,
      encodedArguments,
      request: requestSnapshot,
      timeoutMs: probeInternalTimeoutMs,
    }).then(
      (completed) => {
        // Mid-probe recovery: chunks arrived while the probe was running.
        if (lastChunkAt > probeStartedAtChunk) {
          return;
        }
        if (completed && !abortSignal.aborted) {
          onProbeCompleted();
        }
      },
      // Probe failures are inconclusive; fall back to regular timeout.
      () => {},
    );
  };

  const scheduleAfterIdle = () => {
    if (idleTimer !== undefined || abortSignal.aborted) {
      return;
    }
    const now = performance.now();
    const idleFor = now - lastChunkAt;
    const wait = Math.max(0, PROBE_THRESHOLD_MS - idleFor);

    // Skip scheduling if the outer fill timeout will fire before the probe
    // could even start with a minimum useful budget.
    if (fillDeadlineAt - now < wait + MIN_PROBE_BUDGET_MS) {
      return;
    }

    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (abortSignal.aborted) {
        return;
      }
      const idleNow = performance.now() - lastChunkAt;
      if (idleNow < PROBE_THRESHOLD_MS) {
        // A chunk arrived since we set this timer; reschedule.
        scheduleAfterIdle();
        return;
      }
      startProbe();
    }, wait);
  };

  abortSignal.addEventListener(
    "abort",
    () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
    },
    { once: true },
  );

  scheduleAfterIdle();

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        lastChunkAt = performance.now();
        scheduleAfterIdle();
        controller.enqueue(chunk);
      },
    }),
  );
}
