"use cache";

// Simulates a slow "use cache" function that takes time but eventually
// completes. The probe should NOT fire a deadlock error for this — the
// function is genuinely slow, not deadlocked on module-scope state.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function UseCacheRecoveryPage() {
  // Wait 12 seconds — longer than the 10s probe threshold, but the function
  // completes on its own (no module-scope deadlock).
  await delay(12_000);

  return (
    <div data-testid="use-cache-recovery-page">
      <h1>Use Cache Recovery Test</h1>
      <p data-testid="message">Slow but working</p>
    </div>
  );
}
