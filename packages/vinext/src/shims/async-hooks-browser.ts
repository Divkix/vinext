/**
 * Browser-safe stub for node:async_hooks.
 *
 * Prevents Rollup named-export errors when shim files importing
 * AsyncLocalStorage are pulled into the client build via resolve.alias.
 * Server-only ALS logic is dead-code-eliminated in client bundles.
 */
export class AsyncLocalStorage<T = unknown> {
	run<R>(_store: T, fn: () => R): R {
		return fn();
	}
	getStore(): T | undefined {
		return undefined;
	}
	disable(): void {}
	enterWith(_store: T): void {}
}
