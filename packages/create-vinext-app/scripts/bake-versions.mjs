#!/usr/bin/env node
/**
 * Bakes monorepo catalog versions into dist/versions.json at build time.
 *
 * Reads the monorepo pnpm-workspace.yaml catalog and the CLI's own
 * package.json, resolves npm: aliases, and writes a JSON map of template
 * placeholders (e.g. {{REACT_VERSION}}) to their current versions.
 *
 * This is consumed at runtime by getTemplateVersions() in catalog.ts
 * so the published CLI doesn't need the monorepo workspace file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from script location to find the monorepo root (contains pnpm-workspace.yaml)
function findWorkspaceRoot(startDir) {
  let dir = startDir;
  while (dir !== resolve(dir, "..")) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  throw new Error("Could not find pnpm-workspace.yaml by walking up from " + startDir);
}

const root = findWorkspaceRoot(__dirname);
const workspaceYaml = resolve(root, "pnpm-workspace.yaml");
const pkgPath = resolve(root, "packages", "create-vinext-app", "package.json");
// dist/ was already created by vp pack (we run post-build)
const distDir = resolve(root, "packages", "create-vinext-app", "dist");

console.log("Baking versions from", workspaceYaml);

const workspace = parseYaml(readFileSync(workspaceYaml, "utf-8"));
const catalog = workspace.catalog ?? {};

const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf-8")) : { version: "0.0.0" };

/**
 * Resolves a catalog entry to a version string.
 * For npm: aliases like "npm:@voidzero-dev/vite-plus-core@0.1.17",
 * extracts just the version portion ("0.1.17").
 * For regular entries like "^19.2.5", returns as-is.
 */
const getVersion = (key) => {
  const entry = catalog[key];
  if (!entry) return "latest";
  if (entry.startsWith("npm:")) {
    const match = entry.match(/@([\d.]+(?:-[a-z0-9.]+)?)$/i);
    return match ? match[1] : entry;
  }
  return entry;
};

const versions = {
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

mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, "versions.json"), JSON.stringify(versions, null, 2) + "\n", "utf-8");

console.log("Baked", Object.keys(versions).length, "template versions to dist/versions.json");
