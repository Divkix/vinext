import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

type WorkspaceCatalog = {
  catalog?: Record<string, string>;
};

/**
 * Reads pnpm-workspace.yaml from the monorepo root at build time.
 * Falls back to empty map if the file is not found (e.g., published package runtime).
 *
 * Resolves npm aliases like `"npm:package@version"` to just the version.
 */
export function getTemplateVersions(): Record<string, string> {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Walk up from dist/ (packages/create-vinext-app/dist/) to monorepo root
    const workspaceYaml = resolve(__dirname, "..", "..", "..", "pnpm-workspace.yaml");

    if (!existsSync(workspaceYaml)) {
      // Not in monorepo — return empty (caller should provide versions)
      return {};
    }

    const content = readFileSync(workspaceYaml, "utf-8");
    const parsed = parseYaml(content) as WorkspaceCatalog;
    const catalog = parsed.catalog ?? {};

    // Read CLI's own version from package.json
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = existsSync(pkgPath)
      ? JSON.parse(readFileSync(pkgPath, "utf-8"))
      : { version: "0.0.0" };

    // Helper to extract version from catalog entry, handling npm: aliases
    const getVersion = (key: string): string => {
      const entry = catalog[key];
      if (!entry) return "latest";
      // Resolve npm: aliases: "npm:package@0.1.17" or "npm:package@0.1.17-canary.5"
      if (entry.startsWith("npm:")) {
        const match = entry.match(/@([\d.]+(?:-[a-z0-9.]+)?)$/i);
        return match ? match[1] : entry;
      }
      return entry;
    };

    return {
      "{{VINEXT_VERSION}}": pkg.version,
      "{{RSC_VERSION}}": getVersion("@vitejs/plugin-rsc"),
      "{{RSDW_VERSION}}": getVersion("react-server-dom-webpack"),
      "{{REACT_VERSION}}": getVersion("react"),
      "{{REACT_DOM_VERSION}}": getVersion("react-dom"),
      "{{PLUGIN_REACT_VERSION}}": getVersion("@vitejs/plugin-react"),
      "{{CF_PLUGIN_VERSION}}": getVersion("@cloudflare/vite-plugin"),
      "{{CF_TYPES_VERSION}}": getVersion("@cloudflare/workers-types"),
      "{{VITE_VERSION}}": getVersion("vite"),
      "{{VITE_PLUS_VERSION}}": getVersion("vite-plus"),
      "{{WRANGLER_VERSION}}": getVersion("wrangler"),
      "{{TS_VERSION}}": getVersion("typescript"),
    };
  } catch {
    // Graceful fallback for environments without the workspace file
    return {};
  }
}
