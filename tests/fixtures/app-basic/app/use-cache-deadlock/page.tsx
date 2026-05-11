"use cache";

// Simulates a module-scope deadlock pattern: a top-level Map used to dedupe
// fetches, where the cache function awaits a promise created by the outer scope.
// In dev mode, the probe should detect this and surface a UseCacheDeadlockError.

const dedupeMap = new Map<string, Promise<unknown>>();

function getDedupedData(key: string): Promise<unknown> {
  const existing = dedupeMap.get(key);
  if (existing) return existing;

  // Create a promise that only resolves when explicitly signaled.
  // In the main request, something else (the outer render) is supposed to
  // resolve this, but since the render is blocked on the cache fill, it never
  // does — causing a deadlock.
  const promise = new Promise<unknown>(() => {
    // Intentionally never resolves — simulates hanging on outer-scope state.
  });

  dedupeMap.set(key, promise);
  return promise;
}

export default async function UseCacheDeadlockPage() {
  // This will hang forever because getDedupedData creates a never-resolving
  // promise and stores it in the module-scope Map.
  await getDedupedData("deadlock-key");

  return (
    <div data-testid="use-cache-deadlock-page">
      <h1>Use Cache Deadlock Test</h1>
      <p data-testid="message">This page should not render</p>
    </div>
  );
}
