import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

type WorkspaceCatalog = {
  catalog?: Record<string, string>;
};

/** Hardcoded fallback versions — last resort if no baked file or workspace is available. */
const HARDCODED_VERSIONS: Record<string, string> = {
  "{{VINEXT_VERSION}}": "latest",
  "{{REACT_VERSION}}": "^19.2.5",
  "{{REACT_DOM_VERSION}}": "^19.2.5",
  "{{RSC_VERSION}}": "^0.5.23",
  "{{RSDW_VERSION}}": "^19.2.5",
  "{{PLUGIN_REACT_VERSION}}": "^6.0.1",
  "{{CF_PLUGIN_VERSION}}": "^1.31.0",
  "{{CF_TYPES_VERSION}}": "^4.0.0",
  "{{VITE_VERSION}}": "latest",
  "{{VITE_PLUS_VERSION}}": "0.1.17",
  "{{WRANGLER_VERSION}}": "^4.80.0",
  "{{TS_VERSION}}": "^5.7.0",
};

/**
 * Resolves a catalog entry to its version string.
 * Strips npm: alias prefixes like "npm:package@0.1.17" → "0.1.17".
 *
 * This function is only used in the dev-time workspace fallback path,
 * since the baked versions.json already contains resolved versions.
 */
function resolveCatalogVersion(entry: string): string {
  if (entry.startsWith("npm:")) {
    const match = entry.match(/@([\d.]+(?:-[a-z0-9.]+)?)$/i);
    return match ? match[1] : entry;
  }
  return entry;
}

/**
 * Extracts versions from the monorepo pnpm-workspace.yaml at dev time.
 * Returns null if the workspace file is not found.
 */
function getYamlVersions(workspaceYaml: string, pkgPath: string): Record<string, string> | null {
  try {
    if (!existsSync(workspaceYaml)) return null;
    const content = readFileSync(workspaceYaml, "utf-8");
    const parsed = parseYaml(content) as WorkspaceCatalog;
    const catalog = parsed.catalog ?? {};

    const pkg = existsSync(pkgPath)
      ? (JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string })
      : { version: "0.0.0" };

    const getVersion = (key: string): string => {
      const entry = catalog[key];
      if (!entry) return "latest";
      return resolveCatalogVersion(entry);
    };

    return {
      "{{VINEXT_VERSION}}": pkg.version ?? "0.0.0",
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
    return null;
  }
}

/**
 * Reads template versions for scaffolding.
 *
 * Resolution order:
 * 1. Baked dist/versions.json (production — published CLI, set by scripts/bake-versions.mjs)
 * 2. Monorepo pnpm-workspace.yaml (dev mode — running via tsx)
 * 3. Hardcoded fallback (last resort)
 */
export function getTemplateVersions(): Record<string, string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // 1. Try baked versions.json first
  //    In prod (dist/):  resolve(__dirname, "versions.json") → dist/versions.json
  //    In dev  (src/):   resolve(__dirname, "..", "dist", "versions.json") → dist/versions.json
  for (const candidate of [
    resolve(__dirname, "versions.json"),
    resolve(__dirname, "..", "dist", "versions.json"),
  ]) {
    if (existsSync(candidate)) {
      try {
        return JSON.parse(readFileSync(candidate, "utf-8")) as Record<string, string>;
      } catch {
        // Corrupt JSON — continue to next candidate
      }
    }
  }

  // 2. Fallback for dev mode: walk up to monorepo pnpm-workspace.yaml
  //    From src/: ../../../pnpm-workspace.yaml = monorepo root
  //    From dist/: ../../../pnpm-workspace.yaml = monorepo root (same nesting)
  const workspaceYaml = resolve(__dirname, "..", "..", "..", "pnpm-workspace.yaml");
  const pkgPath = resolve(__dirname, "..", "package.json");
  const yamlVersions = getYamlVersions(workspaceYaml, pkgPath);
  if (yamlVersions) return yamlVersions;

  // 3. Hardcoded fallback
  return HARDCODED_VERSIONS;
}
