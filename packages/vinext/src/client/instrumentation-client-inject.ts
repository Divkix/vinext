/**
 * Generate a virtual ESM module that implements the Next.js
 * `instrumentationClientInject` contract for client bootstrap.
 *
 * When `injects` is empty, this is a transparent passthrough (or no-op
 * when no user file exists). Otherwise it generates side-effect imports
 * for each inject in array order, then the user's instrumentation-client
 * file last, and exports a single composed `onRouterTransitionStart` that
 * fans out to every module's hook.
 *
 * @param injects - Module specifiers from `nextConfig.instrumentationClientInject`
 * @param userPath - Absolute path to the user's `instrumentation-client` file,
 *                   or `null` when the file doesn't exist
 */
export function generateInstrumentationClientInjectModule(
  injects: readonly string[],
  userPath: string | null,
): string {
  const EMPTY_MODULE = "vinext/client/empty-module";

  // No injects: Next.js keeps the current transparent passthrough.
  // The alias already handles the user file or empty-module, so emit
  // nothing that could shadow what the alias resolves.
  if (injects.length === 0) {
    return "export {};";
  }

  const lines: string[] = [];

  for (let i = 0; i < injects.length; i++) {
    lines.push(`import * as __vinj_${i} from ${JSON.stringify(injects[i])};`);
  }

  const lastIndex = injects.length;
  lines.push(`import * as __vinj_${lastIndex} from ${JSON.stringify(userPath ?? EMPTY_MODULE)};`);

  const hookCalls: string[] = [];
  for (let i = 0; i <= lastIndex; i++) {
    hookCalls.push(
      `  if (typeof __vinj_${i}.onRouterTransitionStart === \"function\") {`,
      `    __vinj_${i}.onRouterTransitionStart(url, type);`,
      `  }`,
    );
  }

  lines.push("");
  lines.push("export function onRouterTransitionStart(url, type) {");
  lines.push(...hookCalls);
  lines.push(`}`);
  lines.push("");

  return lines.join("\n");
}
