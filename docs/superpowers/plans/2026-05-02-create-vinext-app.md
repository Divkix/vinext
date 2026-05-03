# create-vinext-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `packages/create-vinext-app/` CLI that scaffolds working vinext projects with one command (`npm create vinext-app@latest my-app --yes`).

**Architecture:** Pure ESM Node.js CLI package with embedded templates. No vinext plugin changes. Templates use baked catalog versions at build time. TDD-first: write failing tests, implement, verify, commit.

**Tech Stack:** Node >= 18, TypeScript, `@clack/prompts` (runtime), `vite-plus` (dev/tooling), `vitest` (testing), `yaml` (catalog parsing at build time).

---

## File Map

| File                                                  | Responsibility                                           |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `packages/create-vinext-app/package.json`             | Package metadata, bin entry, deps                        |
| `packages/create-vinext-app/tsconfig.json`            | TypeScript compilation config                            |
| `packages/create-vinext-app/src/install.ts`           | Package manager detection + install command builder      |
| `packages/create-vinext-app/src/validate.ts`          | Project name validation + path resolution                |
| `packages/create-vinext-app/src/catalog.ts`           | Read pnpm-workspace.yaml catalog, resolve npm aliases    |
| `packages/create-vinext-app/src/scaffold.ts`          | Template copy, `.tmpl` substitution, `_gitignore` rename |
| `packages/create-vinext-app/src/prompts.ts`           | `@clack/prompts` interactive UI                          |
| `packages/create-vinext-app/src/index.ts`             | Main entry: arg parsing, wiring, `main()`                |
| `packages/create-vinext-app/templates/app-router/`    | App Router template (11 files)                           |
| `packages/create-vinext-app/templates/pages-router/`  | Pages Router template (~15 files)                        |
| `packages/create-vinext-app/test/cli.test.ts`         | Unit tests for install, validate, catalog, arg parsing   |
| `packages/create-vinext-app/test/scaffold.test.ts`    | Scaffold function tests with temp dirs                   |
| `packages/create-vinext-app/test/integration.test.ts` | Full `main()` E2E with both templates                    |
| `.github/workflows/ci.yml`                            | Add `create-vinext-app` job                              |
| `.github/workflows/publish.yml`                       | Add create-vinext-app publish steps                      |
| `README.md`                                           | Update new-project section, remove "Not a goal" line     |

---

### Task 1: Package scaffolding

**Files:**

- Create: `packages/create-vinext-app/package.json`
- Create: `packages/create-vinext-app/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "create-vinext-app",
  "version": "0.0.5",
  "description": "Scaffold a new vinext project targeting Cloudflare Workers",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cloudflare/vinext.git"
  },
  "bin": {
    "create-vinext-app": "dist/index.js"
  },
  "files": ["dist"],
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "vp pack",
    "test": "vp test"
  },
  "dependencies": {
    "@clack/prompts": "^0.12.0",
    "yaml": "^2.8.0"
  },
  "devDependencies": {
    "vite-plus": "catalog:",
    "@types/node": "catalog:"
  }
}
```

Run: `vp install` to install deps.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules", "templates", "test"]
}
```

- [ ] **Step 3: Create test directory and vitest config**

Create `packages/create-vinext-app/vitest.config.ts`:

```ts
import { defineConfig } from "vite-plus/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify build works (empty src)**

Create a minimal `packages/create-vinext-app/src/index.ts`:

```ts
#!/usr/bin/env node
console.log("create-vinext-app placeholder");
```

Run: `vp run build` from `packages/create-vinext-app/`
Expected: Build succeeds, `dist/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/create-vinext-app/package.json packages/create-vinext-app/tsconfig.json packages/create-vinext-app/vitest.config.ts packages/create-vinext-app/src/index.ts
git commit -m "chore: scaffold create-vinext-app package structure"
```

---

### Task 2: install.ts — Package manager detection

**Files:**

- Create: `packages/create-vinext-app/test/cli.test.ts`
- Create: `packages/create-vinext-app/src/install.ts`

- [ ] **Step 1: Write failing tests for detectPackageManager**

In `packages/create-vinext-app/test/cli.test.ts`:

```ts
import { expect, test, describe } from "vite-plus/test";
import { detectPackageManager, buildInstallCommand } from "../src/install.js";

describe("detectPackageManager", () => {
  test("returns npm when npm_config_user_agent is missing", () => {
    expect(detectPackageManager({})).toBe("npm");
  });

  test("returns npm when npm_config_user_agent is empty", () => {
    expect(detectPackageManager({ npm_config_user_agent: "" })).toBe("npm");
  });

  test("detects pnpm from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "pnpm/8.15.0 npm/? node/v20.11.0 darwin arm64",
      }),
    ).toBe("pnpm");
  });

  test("detects yarn from user agent", () => {
    expect(
      detectPackageManager({
        npm_config_user_agent: "yarn/1.22.22 npm/? node/v20.11.0 darwin arm64",
      }),
    ).toBe("yarn");
  });

  test("detects bun from user agent", () => {
    expect(
      detectPackageManager({ npm_config_user_agent: "bun/1.2.0 npm/? node/v20.11.0 darwin arm64" }),
    ).toBe("bun");
  });

  test("detects npm from user agent", () => {
    expect(
      detectPackageManager({ npm_config_user_agent: "npm/10.2.0 node/v20.11.0 darwin arm64" }),
    ).toBe("npm");
  });

  test("handles unknown user agent by returning npm", () => {
    expect(detectPackageManager({ npm_config_user_agent: "yolo/1.0.0" })).toBe("npm");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test test/cli.test.ts`
Expected: FAIL — `detectPackageManager is not defined` or similar.

- [ ] **Step 3: Implement detectPackageManager**

In `packages/create-vinext-app/src/install.ts`:

```ts
const KNOWN_PMS = new Set(["pnpm", "yarn", "bun"]);

export function detectPackageManager(
  env: Record<string, string | undefined> = process.env,
): "npm" | "pnpm" | "yarn" | "bun" {
  const ua = env.npm_config_user_agent;
  if (!ua) return "npm";
  const name = ua.trim().toLowerCase().split(" ")[0]?.split("/")[0];
  if (name && KNOWN_PMS.has(name)) return name as "pnpm" | "yarn" | "bun";
  return "npm";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test test/cli.test.ts -t "detectPackageManager"`
Expected: PASS (6 tests)

- [ ] **Step 5: Write failing tests for buildInstallCommand**

Add to `packages/create-vinext-app/test/cli.test.ts`:

```ts
describe("buildInstallCommand", () => {
  test("returns npm install for npm", () => {
    expect(buildInstallCommand("npm")).toEqual(["npm", "install"]);
  });

  test("returns pnpm install for pnpm", () => {
    expect(buildInstallCommand("pnpm")).toEqual(["pnpm", "install"]);
  });

  test("returns yarn for yarn (yarn install is implicit)", () => {
    expect(buildInstallCommand("yarn")).toEqual(["yarn"]);
  });

  test("returns bun install for bun", () => {
    expect(buildInstallCommand("bun")).toEqual(["bun", "install"]);
  });
});
```

- [ ] **Step 6: Implement buildInstallCommand**

Add to `packages/create-vinext-app/src/install.ts`:

```ts
export function buildInstallCommand(pm: "npm" | "pnpm" | "yarn" | "bun"): string[] {
  switch (pm) {
    case "bun":
      return ["bun", "install"];
    case "pnpm":
      return ["pnpm", "install"];
    case "yarn":
      return ["yarn"];
    case "npm":
      return ["npm", "install"];
  }
}
```

- [ ] **Step 7: Run all install tests**

Run: `vp test test/cli.test.ts`
Expected: 10 tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/create-vinext-app/src/install.ts packages/create-vinext-app/test/cli.test.ts
git commit -m "feat(create-vinext-app): add package manager detection and install command builder"
```

---

### Task 3: validate.ts — Project name validation

**Files:**

- Modify: `packages/create-vinext-app/test/cli.test.ts`
- Create: `packages/create-vinext-app/src/validate.ts`

- [ ] **Step 1: Write failing tests for validateProjectName**

Append to `packages/create-vinext-app/test/cli.test.ts`:

```ts
import { validateProjectName, resolveProjectPath, isDirectoryEmpty } from "../src/validate.js";

describe("validateProjectName", () => {
  test("rejects empty name", () => {
    expect(validateProjectName("")).toEqual({ valid: false, message: "Project name is required" });
  });

  test("accepts '.' and returns useCwd", () => {
    expect(validateProjectName(".")).toEqual({ valid: true, useCwd: true });
  });

  test("rejects reserved names", () => {
    expect(validateProjectName("node_modules").valid).toBe(false);
    expect(validateProjectName("package.json").valid).toBe(false);
    expect(validateProjectName("favicon.ico").valid).toBe(false);
  });

  test("rejects names over 214 chars", () => {
    expect(validateProjectName("a".repeat(215)).valid).toBe(false);
  });

  test("rejects names with spaces", () => {
    expect(validateProjectName("my app").valid).toBe(false);
  });

  test("rejects names with invalid characters", () => {
    expect(validateProjectName("my!app").valid).toBe(false);
  });

  test("accepts valid names", () => {
    expect(validateProjectName("my-app")).toEqual({ valid: true });
    expect(validateProjectName("my_app")).toEqual({ valid: true });
    expect(validateProjectName("my.app")).toEqual({ valid: true });
  });

  test("auto-normalizes uppercase to lowercase", () => {
    const result = validateProjectName("My-App");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("my-app");
  });

  test("accepts scoped names", () => {
    expect(validateProjectName("@org/my-app")).toEqual({ valid: true });
  });

  test("rejects scoped names with invalid format", () => {
    expect(validateProjectName("@/my-app").valid).toBe(false);
    expect(validateProjectName("@org/").valid).toBe(false);
  });

  test("rejects names starting with a number", () => {
    expect(validateProjectName("123app").valid).toBe(false);
  });

  test("rejects names starting with a hyphen", () => {
    expect(validateProjectName("-leading").valid).toBe(false);
  });
});

describe("resolveProjectPath", () => {
  test("returns cwd for '.'", () => {
    expect(resolveProjectPath(".", "/home/user")).toBe("/home/user");
  });

  test("resolves relative paths", () => {
    expect(resolveProjectPath("my-app", "/home/user")).toBe("/home/user/my-app");
  });

  test("returns absolute paths as-is", () => {
    expect(resolveProjectPath("/tmp/my-app", "/home/user")).toBe("/tmp/my-app");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test test/cli.test.ts -t "validateProjectName"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validate.ts**

```ts
import fs from "node:fs";
import path from "node:path";

const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  "package.json",
  "package-lock.json",
]);

export function validateProjectName(name: string):
  | {
      valid: true;
      useCwd?: true;
      normalized?: string;
    }
  | {
      valid: false;
      message: string;
    } {
  if (name === "") {
    return { valid: false, message: "Project name is required" };
  }
  if (name === ".") {
    return { valid: true, useCwd: true };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return {
      valid: false,
      message: `"${name}" is a reserved name and cannot be used as a project name`,
    };
  }
  if (name.length > 214) {
    return { valid: false, message: "Project name must be 214 characters or fewer" };
  }
  if (/\s/.test(name)) {
    return { valid: false, message: "Project name cannot contain spaces" };
  }
  if (!/^[a-zA-Z0-9\-._@/]+$/.test(name)) {
    return {
      valid: false,
      message:
        "Project name can only contain letters, numbers, hyphens, dots, underscores, and scoped package prefixes (@org/)",
    };
  }

  // Validate scoped package name structure: @scope/name
  if (name.startsWith("@")) {
    if (!/^@[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*$/i.test(name)) {
      return { valid: false, message: 'Scoped package name must be in the format "@scope/name"' };
    }
  }

  // Determine the "bare" name for start-char validation
  const bareName = name.startsWith("@") ? (name.split("/").pop() ?? name) : name;

  if (/^\d/.test(bareName)) {
    return { valid: false, message: "Project name cannot start with a number" };
  }

  if (bareName.startsWith("-")) {
    return { valid: false, message: "Project name cannot start with a hyphen" };
  }

  if (name !== name.toLowerCase()) {
    return { valid: true, normalized: name.toLowerCase() };
  }

  return { valid: true };
}

export function resolveProjectPath(name: string, cwd: string): string {
  if (name === ".") return cwd;
  if (path.isAbsolute(name)) return name;
  return path.resolve(cwd, name);
}

const IGNORABLE_FILES = new Set([".git", ".DS_Store", ".gitkeep", "Thumbs.db"]);

export function isDirectoryEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir);
  return entries.every((entry) => IGNORABLE_FILES.has(entry));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test test/cli.test.ts -t "validateProjectName|resolveProjectPath"`
Expected: 15 tests PASS (10 from install + 15 from validate + 4 from resolve)

- [ ] **Step 5: Commit**

```bash
git add packages/create-vinext-app/src/validate.ts packages/create-vinext-app/test/cli.test.ts
git commit -m "feat(create-vinext-app): add project name validation and path resolution"
```

---

### Task 4: catalog.ts — Version baking from pnpm-workspace.yaml

**Files:**

- Modify: `packages/create-vinext-app/test/cli.test.ts`
- Create: `packages/create-vinext-app/src/catalog.ts`

**Design note:** `getTemplateVersions()` reads `pnpm-workspace.yaml` at module init time. During build (`vp run build`), this executes in the monorepo context where the file exists. At runtime in the published package, `getTemplateVersions()` gracefully falls back to empty mappings if the file can't be read. In practice, the build always happens in the monorepo (CI, local dev), so versions are always correct.

- [ ] **Step 1: Write failing tests for getTemplateVersions**

Append to `packages/create-vinext-app/test/cli.test.ts`:

```ts
import { getTemplateVersions } from "../src/catalog.js";

describe("getTemplateVersions", () => {
  test("returns an object with expected keys (or empty object)", () => {
    const versions = getTemplateVersions();
    // When running in monorepo, should have all keys
    // When running standalone, returns empty object (no-op)
    if (Object.keys(versions).length > 0) {
      expect(versions["{{VINEXT_VERSION}}"]).toBeDefined();
      expect(versions["{{REACT_VERSION}}"]).toBeDefined();
      expect(versions["{{REACT_DOM_VERSION}}"]).toBeDefined();
      expect(versions["{{PLUGIN_REACT_VERSION}}"]).toBeDefined();
      expect(versions["{{CF_PLUGIN_VERSION}}"]).toBeDefined();
      expect(versions["{{CF_TYPES_VERSION}}"]).toBeDefined();
      expect(versions["{{WRANGLER_VERSION}}"]).toBeDefined();
      expect(versions["{{TS_VERSION}}"]).toBeDefined();
      expect(versions["{{VITE_PLUS_VERSION}}"]).toBeDefined();
    }
  });

  test("returns version values that look like reasonable strings", () => {
    const versions = getTemplateVersions();
    for (const [key, value] of Object.entries(versions)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test test/cli.test.ts -t "getTemplateVersions"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement catalog.ts**

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

interface WorkspaceCatalog {
  catalog?: Record<string, string>;
}

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test test/cli.test.ts`
Expected: All tests PASS (10 install + 15 validate + 4 resolve + 2 catalog = 31 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/create-vinext-app/src/catalog.ts packages/create-vinext-app/test/cli.test.ts
git commit -m "feat(create-vinext-app): add catalog version baking from pnpm-workspace.yaml"
```

---

### Task 5: scaffold.ts — Template copying and variable substitution

**Files:**

- Create: `packages/create-vinext-app/test/scaffold.test.ts`
- Create: `packages/create-vinext-app/src/scaffold.ts`

- [ ] **Step 1: Write failing tests for scaffold and helper functions**

```ts
import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { sanitizeWorkerName, scaffold } from "../src/scaffold.js";

describe("sanitizeWorkerName", () => {
  test("returns lowercase name unchanged", () => {
    expect(sanitizeWorkerName("my-app")).toBe("my-app");
  });

  test("lowercases uppercase input", () => {
    expect(sanitizeWorkerName("My-App")).toBe("my-app");
  });

  test("strips scope from scoped names", () => {
    expect(sanitizeWorkerName("@org/my-app")).toBe("my-app");
  });

  test("replaces special characters with hyphens", () => {
    expect(sanitizeWorkerName("my_app.with.dots")).toBe("my-app-with-dots");
  });

  test("strips leading and trailing hyphens", () => {
    expect(sanitizeWorkerName("-leading")).toBe("leading");
    expect(sanitizeWorkerName("trailing-")).toBe("trailing");
  });

  test("collapses consecutive hyphens", () => {
    expect(sanitizeWorkerName("a--b---c")).toBe("a-b-c");
  });
});

describe("scaffold", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-scaffold-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates project directory", () => {
    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _exec: () => {},
    });
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.statSync(projectPath).isDirectory()).toBe(true);
  });

  test("substitutes template variables in .tmpl files", () => {
    // Create a minimal template directory
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(path.join(templateDir, "subdir"), { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, "package.json.tmpl"),
      JSON.stringify({ name: "{{PROJECT_NAME}}", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(templateDir, "subdir", "config.ts.tmpl"),
      'export const name = "{{PROJECT_NAME}}";',
    );
    // Also test catalog version substitution
    fs.writeFileSync(
      path.join(templateDir, "deps.json.tmpl"),
      JSON.stringify({ react: "{{REACT_VERSION}}" }),
    );

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "my-app",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      versionVars: { "{{REACT_VERSION}}": "^19.0.0" },
      _templateDir: templateDir,
      _exec: () => {},
    });

    // .tmpl file should be processed and renamed
    const pkgContent = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkgContent.name).toBe("my-app");

    const configContent = fs.readFileSync(path.join(projectPath, "subdir", "config.ts"), "utf-8");
    expect(configContent).toContain('"my-app"');

    // Catalog version substitution
    const depsContent = JSON.parse(fs.readFileSync(path.join(projectPath, "deps.json"), "utf-8"));
    expect(depsContent.react).toBe("^19.0.0");

    // Original .tmpl files should be gone
    expect(fs.existsSync(path.join(projectPath, "package.json.tmpl"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "deps.json.tmpl"))).toBe(false);
  });

  test("renames _gitignore to .gitignore", () => {
    // Create a template with _gitignore
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(templateDir, "_gitignore"), "node_modules\n");

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _templateDir: templateDir,
      _exec: () => {},
    });

    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "_gitignore"))).toBe(false);
  });

  test("does not create .gitignore if _gitignore does not exist in template", () => {
    const templateDir = path.join(tmpDir, "template");
    fs.mkdirSync(templateDir, { recursive: true });

    const projectPath = path.join(tmpDir, "test-project");
    scaffold({
      projectPath,
      projectName: "test-project",
      template: "app",
      install: false,
      git: false,
      pm: "npm",
      vinextVersion: "^0.0.0",
      _templateDir: templateDir,
      _exec: () => {},
    });

    // .gitignore should not be created since _gitignore didn't exist
    // (it's only created if _gitignore existed in template)
    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test test/scaffold.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scaffold.ts**

```ts
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildInstallCommand } from "./install.js";

export interface ScaffoldOptions {
  projectPath: string;
  projectName: string;
  template: "app" | "pages";
  install: boolean;
  git: boolean;
  pm: "npm" | "pnpm" | "yarn" | "bun";
  vinextVersion: string;
  versionVars?: Record<string, string>; // Catalog version variables for template substitution
  _exec?: (cmd: string, args: string[], opts: { cwd: string }) => void;
  _templateDir?: string;
}

function defaultExec(cmd: string, args: string[], opts: { cwd: string }): void {
  execFileSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
}

export function sanitizeWorkerName(name: string): string {
  const unscoped = name.startsWith("@") ? (name.split("/").pop() ?? name) : name;
  return unscoped
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function processTmplFiles(dir: string, vars: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processTmplFiles(fullPath, vars);
    } else if (entry.name.endsWith(".tmpl")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(key, value);
      }
      const newPath = fullPath.slice(0, -5); // strip .tmpl
      fs.writeFileSync(newPath, content, "utf-8");
      fs.unlinkSync(fullPath);
    }
  }
}

export function scaffold(options: ScaffoldOptions): void {
  const { projectPath, projectName, template, install, git, pm, vinextVersion, versionVars } =
    options;
  const exec = options._exec ?? defaultExec;

  // Create project directory
  fs.mkdirSync(projectPath, { recursive: true });

  // Determine template directory
  const templateDir =
    options._templateDir ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "templates",
      template === "app" ? "app-router" : "pages-router",
    );

  // Copy template files
  copyDir(templateDir, projectPath);

  // Substitute .tmpl variables (catalog versions + project-specific)
  const workerName = sanitizeWorkerName(projectName);
  processTmplFiles(projectPath, {
    ...(versionVars ?? {}), // Catalog versions (RSC, React, Vite, etc.)
    "{{PROJECT_NAME}}": projectName,
    "{{WORKER_NAME}}": workerName,
    "{{VINEXT_VERSION}}": vinextVersion,
  });

  // Rename _gitignore -> .gitignore
  const gitignoreSrc = path.join(projectPath, "_gitignore");
  const gitignoreDst = path.join(projectPath, ".gitignore");
  if (fs.existsSync(gitignoreSrc)) {
    fs.renameSync(gitignoreSrc, gitignoreDst);
  }

  // Git init
  if (git) {
    exec("git", ["init"], { cwd: projectPath });
  }

  // Install deps
  if (install) {
    const [cmd, ...args] = buildInstallCommand(pm);
    exec(cmd, args, { cwd: projectPath });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test test/scaffold.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/create-vinext-app/src/scaffold.ts packages/create-vinext-app/test/scaffold.test.ts
git commit -m "feat(create-vinext-app): add template scaffolding with variable substitution"
```

---

### Task 6: prompts.ts — Interactive CLI prompts

**Files:**

- Create: `packages/create-vinext-app/src/prompts.ts`

- [ ] **Step 1: Implement prompts.ts**

```ts
import * as p from "@clack/prompts";

export interface PromptDefaults {
  projectName?: string;
  template?: "app" | "pages";
}

export interface PromptAnswers {
  projectName: string;
  template: "app" | "pages";
}

export async function runPrompts(defaults: PromptDefaults): Promise<PromptAnswers | null> {
  p.intro("create-vinext-app");

  try {
    const answers = await p.group({
      projectName: () =>
        defaults.projectName
          ? Promise.resolve(defaults.projectName)
          : p.text({
              message: "Project name:",
              placeholder: "my-vinext-app",
              validate: (value: string) => {
                if (!value.trim()) return "Project name is required";
              },
            }),
      template: () =>
        defaults.template
          ? Promise.resolve(defaults.template)
          : p.select({
              message: "Which router?",
              options: [
                { value: "app" as const, label: "App Router", hint: "recommended" },
                { value: "pages" as const, label: "Pages Router" },
              ],
            }),
    });

    if (p.isCancel(answers)) {
      p.cancel("Cancelled.");
      return null;
    }

    return answers as PromptAnswers;
  } catch {
    p.cancel("Cancelled.");
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/create-vinext-app/src/prompts.ts
git commit -m "feat(create-vinext-app): add interactive prompts with @clack/prompts"
```

---

### Task 7: index.ts — Main CLI entry point

**Files:**

- Modify: `packages/create-vinext-app/src/index.ts` (overwrite placeholder)
- Modify: `packages/create-vinext-app/test/cli.test.ts`

- [ ] **Step 1: Write failing tests for parseArgs**

Append to `packages/create-vinext-app/test/cli.test.ts`:

```ts
import { parseArgs } from "../src/index.js";

describe("parseArgs", () => {
  test("parses project name", () => {
    const opts = parseArgs(["my-app"]);
    expect(opts.projectName).toBe("my-app");
  });

  test("parses --yes flag", () => {
    expect(parseArgs(["--yes"]).yes).toBe(true);
    expect(parseArgs(["-y"]).yes).toBe(true);
  });

  test("parses --skip-install flag", () => {
    expect(parseArgs(["--skip-install"]).skipInstall).toBe(true);
  });

  test("parses --no-git flag", () => {
    expect(parseArgs(["--no-git"]).noGit).toBe(true);
  });

  test("parses --help flag", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  test("parses --version flag", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  test("parses --template app", () => {
    expect(parseArgs(["--template", "app"]).template).toBe("app");
  });

  test("parses --template pages", () => {
    expect(parseArgs(["--template", "pages"]).template).toBe("pages");
  });

  test("exits on invalid template", () => {
    const prevExit = process.exit;
    // @ts-expect-error - mock for test
    process.exit = (code?: number) => {
      throw new Error(`exit ${code}`);
    };
    try {
      expect(() => parseArgs(["--template", "invalid"])).toThrow("exit 1");
    } finally {
      process.exit = prevExit;
    }
  });

  test("parses combined flags", () => {
    const opts = parseArgs(["--template", "pages", "--yes", "--skip-install", "my-app"]);
    expect(opts.template).toBe("pages");
    expect(opts.yes).toBe(true);
    expect(opts.skipInstall).toBe(true);
    expect(opts.projectName).toBe("my-app");
  });

  test("rejects unknown flags", () => {
    const prevExit = process.exit;
    // @ts-expect-error - mock for test
    process.exit = (code?: number) => {
      throw new Error(`exit ${code}`);
    };
    try {
      expect(() => parseArgs(["--unknown"])).toThrow("exit 1");
    } finally {
      process.exit = prevExit;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test test/cli.test.ts -t "parseArgs"`
Expected: FAIL — parseArgs not found.

- [ ] **Step 3: Implement index.ts**

Overwrite the placeholder `packages/create-vinext-app/src/index.ts`:

```ts
#!/usr/bin/env node
import path from "node:path";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateProjectName, resolveProjectPath, isDirectoryEmpty } from "./validate.js";
import { detectPackageManager } from "./install.js";
import { scaffold } from "./scaffold.js";
import { getTemplateVersions } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
const VERSION = pkg.version;

export interface CliOptions {
  yes: boolean;
  skipInstall: boolean;
  noGit: boolean;
  help: boolean;
  version: boolean;
  projectName?: string;
  template?: "app" | "pages";
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    yes: false,
    skipInstall: false,
    noGit: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--version":
      case "-v":
        opts.version = true;
        break;
      case "--yes":
      case "-y":
        opts.yes = true;
        break;
      case "--skip-install":
        opts.skipInstall = true;
        break;
      case "--no-git":
        opts.noGit = true;
        break;
      case "--template": {
        i++;
        const tmpl = argv[i];
        if (tmpl !== "app" && tmpl !== "pages") {
          console.error(`Invalid template: "${tmpl}". Must be "app" or "pages".`);
          process.exit(1);
        }
        opts.template = tmpl;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        if (!opts.projectName) {
          opts.projectName = arg;
        }
        break;
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
create-vinext-app v${VERSION}

Scaffold a new vinext project targeting Cloudflare Workers.

Usage:
  create-vinext-app [project-name] [options]

Options:
  --template <app|pages>   Router template (default: app)
  --yes, -y                Skip prompts, use defaults
  --skip-install           Skip dependency installation
  --no-git                 Skip git init
  --help, -h               Show help
  --version, -v            Show version

Examples:
  npm create vinext-app@latest
  npm create vinext-app@latest my-app
  npm create vinext-app@latest my-app --template pages
  npm create vinext-app@latest my-app --yes --skip-install
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.version) {
    console.log(VERSION);
    return;
  }

  let projectName: string | undefined;
  let template: "app" | "pages";

  if (opts.yes || !process.stdin.isTTY) {
    projectName = opts.projectName ?? "my-vinext-app";
    template = opts.template ?? "app";
  } else {
    const { runPrompts } = await import("./prompts.js");
    const answers = await runPrompts({
      projectName: opts.projectName,
      template: opts.template,
    });
    if (!answers) return;
    projectName = answers.projectName;
    template = answers.template;
  }

  // Handle path-like project names
  let targetDir: string | undefined;
  const looksLikePath =
    path.isAbsolute(projectName) ||
    projectName.startsWith("./") ||
    projectName.startsWith("../") ||
    projectName.startsWith(".\\") ||
    projectName.startsWith("..\\") ||
    projectName.includes(path.sep) ||
    projectName.includes("/");

  if (looksLikePath) {
    targetDir = path.resolve(projectName);
    projectName = path.basename(targetDir);
  }

  // Validate project name
  let validation = validateProjectName(projectName);
  if (!validation.valid) {
    console.error(`Invalid project name: ${validation.message}`);
    process.exit(1);
  }

  // Handle "." (current directory)
  if (validation.valid && "useCwd" in validation && validation.useCwd) {
    targetDir = process.cwd();
    projectName = path.basename(process.cwd());
    validation = validateProjectName(projectName);
    if (!validation.valid) {
      console.error(`Invalid project name derived from cwd: ${validation.message}`);
      process.exit(1);
    }
  }

  const normalizedName =
    validation.valid && "normalized" in validation ? validation.normalized : projectName;

  const projectPath = targetDir ?? resolveProjectPath(normalizedName, process.cwd());

  // Check directory is empty
  if (!isDirectoryEmpty(projectPath)) {
    console.error(`Directory "${projectPath}" is not empty.`);
    process.exit(1);
  }

  const pm = detectPackageManager();
  const catalogVars = getTemplateVersions();

  scaffold({
    projectPath,
    projectName: normalizedName,
    template,
    install: !opts.skipInstall,
    git: !opts.noGit,
    pm,
    vinextVersion: `^${VERSION}`,
    versionVars: catalogVars,
  });

  // Success message
  const relativePath = path.relative(process.cwd(), projectPath);
  console.log("");
  console.log(`Success! Created ${normalizedName} at ${projectPath}`);
  console.log("");
  console.log("Next steps:");
  if (relativePath && relativePath !== ".") {
    console.log(`  cd ${relativePath}`);
  }
  if (opts.skipInstall) {
    const pmCmd = pm === "yarn" ? "yarn" : `${pm} install`;
    console.log(`  ${pmCmd}`);
  }
  console.log(`  ${pm === "npm" ? "npm run" : pm} dev`);
  console.log("");
}

// Auto-run when this is the entry point
const thisFile = path.resolve(fileURLToPath(import.meta.url));
const entryFile = process.argv[1];
if (entryFile) {
  const resolveReal = (p: string) => {
    try {
      return realpathSync(path.resolve(p));
    } catch {
      return path.resolve(p);
    }
  };
  const resolvedEntry = resolveReal(entryFile);
  const resolvedThis = resolveReal(thisFile);
  if (resolvedEntry === resolvedThis || resolvedEntry === resolvedThis.replace(/\.ts$/, ".js")) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test test/cli.test.ts`
Expected: All tests PASS (31 previous + ~11 parseArgs = ~42 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/create-vinext-app/src/index.ts packages/create-vinext-app/test/cli.test.ts
git commit -m "feat(create-vinext-app): add main CLI entry point with arg parsing and scaffold wiring"
```

---

### Task 8: App Router template

**Files:**

- Create: `packages/create-vinext-app/templates/app-router/` (11 files)

- [ ] **Step 1: Create package.json.tmpl**

`packages/create-vinext-app/templates/app-router/package.json.tmpl`:

```json
{
  "name": "{{PROJECT_NAME}}",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vp dev",
    "build": "vp build",
    "preview": "vp preview"
  },
  "dependencies": {
    "vinext": "^{{VINEXT_VERSION}}",
    "@vitejs/plugin-rsc": "{{RSC_VERSION}}",
    "react-server-dom-webpack": "{{RSDW_VERSION}}",
    "react": "{{REACT_VERSION}}",
    "react-dom": "{{REACT_DOM_VERSION}}",
    "@vitejs/plugin-react": "{{PLUGIN_REACT_VERSION}}",
    "@cloudflare/vite-plugin": "{{CF_PLUGIN_VERSION}}",
    "vite": "{{VITE_VERSION}}",
    "wrangler": "{{WRANGLER_VERSION}}"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "{{CF_TYPES_VERSION}}",
    "vite-plus": "{{VITE_PLUS_VERSION}}",
    "typescript": "{{TS_VERSION}}"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["app", "worker", "*.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
```

- [ ] **Step 4: Create wrangler.jsonc.tmpl**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{WORKER_NAME}}",
  "compatibility_date": "2026-05-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "vinext/server/app-router-entry",
  "preview_urls": true,
}
```

- [ ] **Step 5: Create \_gitignore**

```
node_modules
dist
.env
.env.local
```

- [ ] **Step 6: Create app/layout.tsx**

```tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "{{PROJECT_NAME}}",
  description: "Built with vinext",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create app/page.tsx**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Welcome to vinext</h1>
      <p>
        Get started by editing <code>app/page.tsx</code>.
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Create app/globals.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}
```

- [ ] **Step 9: Create worker/index.ts**

```ts
import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request): Promise<Response> {
    return handler.fetch(request);
  },
};
```

- [ ] **Step 10: Create public/ directory with placeholder**

```bash
mkdir -p packages/create-vinext-app/templates/app-router/public
```

Create `packages/create-vinext-app/templates/app-router/public/.gitkeep` (empty file).

- [ ] **Step 11: Commit**

```bash
git add packages/create-vinext-app/templates/app-router/
git commit -m "feat(create-vinext-app): add App Router template"
```

---

### Task 9: Pages Router template

**Files:**

- Create: `packages/create-vinext-app/templates/pages-router/` (~15 files)

- [ ] **Step 1: Create package.json.tmpl**

`packages/create-vinext-app/templates/pages-router/package.json.tmpl`:

```json
{
  "name": "{{PROJECT_NAME}}",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vp dev",
    "build": "vp build",
    "preview": "vp preview"
  },
  "dependencies": {
    "vinext": "^{{VINEXT_VERSION}}",
    "react": "{{REACT_VERSION}}",
    "react-dom": "{{REACT_DOM_VERSION}}",
    "@vitejs/plugin-react": "{{PLUGIN_REACT_VERSION}}",
    "@cloudflare/vite-plugin": "{{CF_PLUGIN_VERSION}}",
    "vite": "{{VITE_VERSION}}",
    "wrangler": "{{WRANGLER_VERSION}}"
  },
  "devDependencies": {
    "vite-plus": "{{VITE_PLUS_VERSION}}",
    "typescript": "{{TS_VERSION}}"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["pages", "worker"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [vinext(), cloudflare()],
});
```

- [ ] **Step 4: Create wrangler.jsonc.tmpl**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{WORKER_NAME}}",
  "compatibility_date": "2026-05-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./worker/index.ts",
  "preview_urls": true,
}
```

- [ ] **Step 5: Create \_gitignore**

```
node_modules
dist
.env
.env.local
```

- [ ] **Step 6: Create pages/index.tsx**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Welcome to vinext</h1>
      <p>
        Get started by editing <code>pages/index.tsx</code>.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Create pages/about.tsx**

```tsx
export default function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>Built with vinext Pages Router.</p>
    </main>
  );
}
```

- [ ] **Step 8: Create pages/api/hello.ts**

```ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ message: "Hello from vinext!" });
}
```

- [ ] **Step 9: Create worker/index.ts**

This is the simplified ~150-line worker entry. Key differences from the 246-line example: no image optimization, no ASSETS binding, config redirects run BEFORE middleware, full middleware/rewrite/header/SSR flow.

```ts
/**
 * Cloudflare Worker entry point for vinext Pages Router.
 */
import {
  matchRedirect,
  matchRewrite,
  matchHeaders,
  requestContextFromRequest,
  isExternalUrl,
  proxyExternalRequest,
  sanitizeDestination,
} from "vinext/config/config-matchers";
import { mergeHeaders } from "vinext/server/worker-utils";

// @ts-expect-error -- virtual module resolved by vinext at build time
import {
  renderPage,
  handleApiRoute,
  runMiddleware,
  vinextConfig,
} from "virtual:vinext-server-entry";

const basePath: string = vinextConfig?.basePath ?? "";
const trailingSlash: boolean = vinextConfig?.trailingSlash ?? false;
const configRedirects = vinextConfig?.redirects ?? [];
const configRewrites = vinextConfig?.rewrites ?? { beforeFiles: [], afterFiles: [], fallback: [] };
const configHeaders = vinextConfig?.headers ?? [];

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      let pathname = url.pathname;
      let urlWithQuery = pathname + url.search;

      // Block protocol-relative URL open redirects
      if (pathname.replaceAll("\\", "/").startsWith("//")) {
        return new Response("404 Not Found", { status: 404 });
      }

      // Strip basePath
      if (basePath && pathname.startsWith(basePath)) {
        const stripped = pathname.slice(basePath.length) || "/";
        urlWithQuery = stripped + url.search;
        pathname = stripped;
      }

      // Trailing slash normalization
      if (pathname !== "/" && !pathname.startsWith("/api")) {
        const hasTrailing = pathname.endsWith("/");
        if (trailingSlash && !hasTrailing) {
          return new Response(null, {
            status: 308,
            headers: { Location: basePath + pathname + "/" + url.search },
          });
        } else if (!trailingSlash && hasTrailing) {
          return new Response(null, {
            status: 308,
            headers: { Location: basePath + pathname.replace(/\/+$/, "") + url.search },
          });
        }
      }

      // Build request with basePath-stripped URL for middleware
      if (basePath) {
        const strippedUrl = new URL(request.url);
        strippedUrl.pathname = pathname;
        request = new Request(strippedUrl, request);
      }

      const reqCtx = requestContextFromRequest(request);

      // Apply config redirects BEFORE middleware
      if (configRedirects.length) {
        const redirect = matchRedirect(pathname, configRedirects, reqCtx);
        if (redirect) {
          const dest = sanitizeDestination(
            basePath &&
              !isExternalUrl(redirect.destination) &&
              !redirect.destination.startsWith(basePath)
              ? basePath + redirect.destination
              : redirect.destination,
          );
          return new Response(null, {
            status: redirect.permanent ? 308 : 307,
            headers: { Location: dest },
          });
        }
      }

      // Run middleware
      let resolvedUrl = urlWithQuery;
      const middlewareHeaders: Record<string, string | string[]> = {};
      let middlewareRewriteStatus: number | undefined;
      if (typeof runMiddleware === "function") {
        const result = await runMiddleware(request);
        if (!result.continue) {
          if (result.redirectUrl) {
            return new Response(null, {
              status: result.redirectStatus ?? 307,
              headers: { Location: result.redirectUrl },
            });
          }
          if (result.response) return result.response;
        }

        if (result.responseHeaders) {
          for (const [key, value] of result.responseHeaders) {
            if (key === "set-cookie") {
              const existing = middlewareHeaders[key];
              if (Array.isArray(existing)) {
                existing.push(value);
              } else if (existing) {
                middlewareHeaders[key] = [existing as string, value];
              } else {
                middlewareHeaders[key] = [value];
              }
            } else {
              middlewareHeaders[key] = value;
            }
          }
        }
        if (result.rewriteUrl) resolvedUrl = result.rewriteUrl;
        middlewareRewriteStatus = result.rewriteStatus;
      }

      // Unpack x-middleware-request-* headers
      const mwReqPrefix = "x-middleware-request-";
      const mwReqHeaders: Record<string, string> = {};
      for (const key of Object.keys(middlewareHeaders)) {
        if (key.startsWith(mwReqPrefix)) {
          mwReqHeaders[key.slice(mwReqPrefix.length)] = middlewareHeaders[key] as string;
          delete middlewareHeaders[key];
        }
      }
      if (Object.keys(mwReqHeaders).length > 0) {
        const newHeaders = new Headers(request.headers);
        for (const [k, v] of Object.entries(mwReqHeaders)) {
          newHeaders.set(k, v);
        }
        request = new Request(request.url, {
          method: request.method,
          headers: newHeaders,
          body: request.body,
          // @ts-expect-error -- duplex needed for streaming request bodies
          duplex: request.body ? "half" : undefined,
        });
      }

      const postMwReqCtx = requestContextFromRequest(request);
      let resolvedPathname = resolvedUrl.split("?")[0];

      // Apply config headers
      if (configHeaders.length) {
        const matched = matchHeaders(pathname, configHeaders, reqCtx);
        for (const h of matched) {
          const lk = h.key.toLowerCase();
          if (lk === "set-cookie") {
            const existing = middlewareHeaders[lk];
            if (Array.isArray(existing)) {
              existing.push(h.value);
            } else if (existing) {
              middlewareHeaders[lk] = [existing as string, h.value];
            } else {
              middlewareHeaders[lk] = [h.value];
            }
          } else if (lk === "vary" && middlewareHeaders[lk]) {
            middlewareHeaders[lk] += ", " + h.value;
          } else if (!(lk in middlewareHeaders)) {
            middlewareHeaders[lk] = h.value;
          }
        }
      }

      // beforeFiles rewrites
      if (configRewrites.beforeFiles?.length) {
        const rewritten = matchRewrite(resolvedPathname, configRewrites.beforeFiles, postMwReqCtx);
        if (rewritten) {
          if (isExternalUrl(rewritten)) return proxyExternalRequest(request, rewritten);
          resolvedUrl = rewritten;
          resolvedPathname = rewritten.split("?")[0];
        }
      }

      // API routes
      if (resolvedPathname.startsWith("/api/") || resolvedPathname === "/api") {
        const response =
          typeof handleApiRoute === "function"
            ? await handleApiRoute(request, resolvedUrl)
            : new Response("404 - API route not found", { status: 404 });
        return mergeHeaders(response, middlewareHeaders, middlewareRewriteStatus);
      }

      // afterFiles rewrites
      if (configRewrites.afterFiles?.length) {
        const rewritten = matchRewrite(resolvedPathname, configRewrites.afterFiles, postMwReqCtx);
        if (rewritten) {
          if (isExternalUrl(rewritten)) return proxyExternalRequest(request, rewritten);
          resolvedUrl = rewritten;
          resolvedPathname = rewritten.split("?")[0];
        }
      }

      // Page routes
      let response: Response | undefined;
      if (typeof renderPage === "function") {
        response = await renderPage(request, resolvedUrl, null);
        if (response && response.status === 404 && configRewrites.fallback?.length) {
          const fallbackRewrite = matchRewrite(
            resolvedPathname,
            configRewrites.fallback,
            postMwReqCtx,
          );
          if (fallbackRewrite) {
            if (isExternalUrl(fallbackRewrite))
              return proxyExternalRequest(request, fallbackRewrite);
            response = await renderPage(request, fallbackRewrite, null);
          }
        }
      }

      if (!response) return new Response("404 - Not found", { status: 404 });
      return mergeHeaders(response, middlewareHeaders, middlewareRewriteStatus);
    } catch (error) {
      console.error("[vinext] Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
```

- [ ] **Step 10: Commit**

```bash
git add packages/create-vinext-app/templates/pages-router/
git commit -m "feat(create-vinext-app): add Pages Router template"
```

---

### Task 10: Integration tests

**Files:**

- Create: `packages/create-vinext-app/test/integration.test.ts`

- [ ] **Step 1: Write integration test**

```ts
import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { main } from "../src/index.js";

describe("integration", () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-int-"));
    originalExit = process.exit;
    // @ts-expect-error - mock
    process.exit = (code?: number) => {
      throw new Error(`exit ${code}`);
    };
  });

  afterEach(() => {
    process.exit = originalExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("scaffolds App Router project with --yes --skip-install --no-git", async () => {
    const projectPath = path.join(tmpDir, "my-app-router");
    await main([projectPath, "--template", "app", "--yes", "--skip-install", "--no-git"]);

    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "vite.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "wrangler.jsonc"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "app", "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "app", "layout.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "worker", "index.ts"))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-app-router");

    // Verify no .tmpl files remain
    const findTmpl = (dir: string): boolean => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          if (findTmpl(path.join(dir, entry.name))) return true;
        } else if (entry.name.endsWith(".tmpl")) {
          return true;
        }
      }
      return false;
    };
    expect(findTmpl(projectPath)).toBe(false);

    // Verify _gitignore was renamed
    expect(fs.existsSync(path.join(projectPath, "_gitignore"))).toBe(false);
  });

  test("scaffolds Pages Router project with --yes --skip-install --no-git", async () => {
    const projectPath = path.join(tmpDir, "my-pages-router");
    await main([projectPath, "--template", "pages", "--yes", "--skip-install", "--no-git"]);

    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages", "index.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages", "about.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "pages", "api", "hello.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "worker", "index.ts"))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-pages-router");
  });

  test("handles scoped project names", async () => {
    const projectPath = path.join(tmpDir, "@org", "my-app");
    await main([projectPath, "--yes", "--skip-install", "--no-git"]);

    expect(fs.existsSync(projectPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    expect(pkg.name).toBe("@org/my-app");

    const wrangler = fs.readFileSync(path.join(projectPath, "wrangler.jsonc"), "utf-8");
    expect(wrangler).toContain('"my-app"');
    expect(wrangler).not.toContain('"@org/my-app"');
  });

  test("handles '.' as project name", async () => {
    const oldDir = process.cwd;
    try {
      // @ts-expect-error - mock
      process.cwd = () => tmpDir;
      fs.mkdirSync(tmpDir, { recursive: true });
      await main([".", "--yes", "--skip-install", "--no-git"]);

      const dirName = path.basename(tmpDir);
      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"));
      expect(pkg.name).toBe(dirName.toLowerCase());
    } finally {
      // @ts-expect-error - restore
      process.cwd = oldDir;
    }
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `vp test test/integration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add packages/create-vinext-app/test/integration.test.ts
git commit -m "test(create-vinext-app): add integration tests for both templates"
```

---

### Task 11: CI — Add create-vinext-app job

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add create-vinext-app job**

Insert a new job after the existing `create-next-app` job (ends at line 141). Add `create-vinext-app` to the `ci` gate job's `needs` list (line 188: `needs: [check, test-unit, test-integration-merge, create-next-app, create-vinext-app, e2e]`).

New job:

```yaml
create-vinext-app:
  name: create-vinext-app (${{ matrix.os }})
  runs-on: ${{ matrix.os }}
  strategy:
    fail-fast: false
    matrix:
      os: [ubuntu-latest, windows-latest]
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - name: Build plugin
      run: vp run build

    - name: Pack vinext for local install
      run: |
        mkdir -p "${{ runner.temp }}/packed"
        cd packages/vinext && vp pm pack --pack-destination "${{ runner.temp }}/packed"
        cd "${{ github.workspace }}"

    - name: Build create-vinext-app
      working-directory: packages/create-vinext-app
      run: vp run build

    - name: Scaffold App Router project
      shell: bash
      run: |
        APPDIR="${{ runner.temp }}/test-app-router"
        node packages/create-vinext-app/dist/index.js "$APPDIR" --template app --yes --skip-install
        vp add "${{ runner.temp }}/packed"/vinext-*.tgz --cwd "$APPDIR"
        vp install --cwd "$APPDIR"

    - name: Verify App Router dev server
      working-directory: ${{ runner.temp }}/test-app-router
      shell: bash
      run: |
        vp dev --port 3099 &
        PID=$!
        for i in $(seq 1 30); do
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3099/ || true)
          if [ "$STATUS" = "200" ]; then
            echo "HTTP 200 (attempt $i)"; kill "$PID" 2>/dev/null || true; break
          fi
          sleep 1
        done
        kill "$PID" 2>/dev/null || true
        [ "$STATUS" = "200" ] || (echo "Server failed" && exit 1)

    - name: Scaffold Pages Router project
      shell: bash
      run: |
        PAGEDIR="${{ runner.temp }}/test-pages-router"
        node packages/create-vinext-app/dist/index.js "$PAGEDIR" --template pages --yes --skip-install
        vp add "${{ runner.temp }}/packed"/vinext-*.tgz --cwd "$PAGEDIR"
        vp install --cwd "$PAGEDIR"

    - name: Verify Pages Router dev server
      working-directory: ${{ runner.temp }}/test-pages-router
      shell: bash
      run: |
        vp dev --port 3098 &
        PID=$!
        for i in $(seq 1 30); do
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3098/ || true)
          if [ "$STATUS" = "200" ]; then
            echo "HTTP 200 (attempt $i)"; kill "$PID" 2>/dev/null || true; break
          fi
          sleep 1
        done
        kill "$PID" 2>/dev/null || true
        [ "$STATUS" = "200" ] || (echo "Server failed" && exit 1)
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add create-vinext-app scaffolding verification job"
```

---

### Task 12: Publish workflow — Bump and publish create-vinext-app

**Files:**

- Modify: `.github/workflows/publish.yml`

- [ ] **Step 1: Add create-vinext-app publish steps**

After the vinext publish step (line 80: `vp pm publish --no-git-checks --access public -- --provenance`), add:

```yaml
- name: Build create-vinext-app
  working-directory: packages/create-vinext-app
  run: vp run build

- name: Bump version (create-vinext-app)
  working-directory: packages/create-vinext-app
  run: npm version "${{ steps.version.outputs.version }}" --no-git-tag-version

- name: Publish create-vinext-app (OIDC trusted publishing)
  working-directory: packages/create-vinext-app
  env:
    NPM_CONFIG_REGISTRY: https://registry.npmjs.org
  run: vp pm publish --no-git-checks --access public -- --provenance
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish create-vinext-app alongside vinext with OIDC"
```

---

### Task 13: README updates

**Files:**

- Modify: `README.md`
- Possibly modify: `.agents/skills/migrate-to-vinext/references/compatibility.md`

- [ ] **Step 1: Update "Starting a new vinext project" section**

Replace lines 87-91 (currently says "Run `npm create next-app@latest`...") with:

````markdown
### Starting a new vinext project

```bash
npm create vinext-app@latest
```
````

This scaffolds a working vinext project with one command:

| Flag                      | Description                      |
| ------------------------- | -------------------------------- |
| `--template <app\|pages>` | Router template (default: `app`) |
| `--yes`, `-y`             | Skip prompts, use defaults       |
| `--skip-install`          | Skip dependency installation     |
| `--no-git`                | Skip git init                    |

```bash
npm create vinext-app@latest my-app --template pages --yes
cd my-app
npm run dev
```

The scaffolded project includes a `vite.config.ts`, `wrangler.jsonc`, sample pages, and a worker entry — ready for `vp dev` or `vp build`.

````

- [ ] **Step 2: Remove "Not a goal" line**

Remove line 554: `- **create-next-app scaffolding** — Not a goal.`

- [ ] **Step 3: Check and update migration skill docs**

Check `.agents/skills/migrate-to-vinext/references/compatibility.md` for references to `create-next-app` scaffolding. If the file lists it as unsupported, update to note that `create-vinext-app` is now available.

- [ ] **Step 4: Commit**

```bash
git add README.md .agents/skills/migrate-to-vinext/references/compatibility.md
git commit -m "docs: update README for create-vinext-app scaffolding"
````

---

### Task 14: Build, test, and verify

- [ ] **Step 1: Build the CLI package**

```bash
vp run build --filter create-vinext-app
```

Expected: Build succeeds. `dist/` contains all compiled JS files. `dist/templates/` contains both template directories.

- [ ] **Step 2: Run full test suite**

```bash
cd packages/create-vinext-app && vp test
```

Expected: All tests PASS (~50 tests: unit + scaffold + integration).

- [ ] **Step 3: Manual smoke test**

```bash
node packages/create-vinext-app/dist/index.js /tmp/vinext-smoke --yes --skip-install --no-git
ls -la /tmp/vinext-smoke/
```

Expected: Project directory with `package.json` (name: "vinext-smoke"), `vite.config.ts`, `wrangler.jsonc`, `.gitignore` (not `_gitignore`), `app/` directory.

```bash
node packages/create-vinext-app/dist/index.js /tmp/vinext-scoped --yes --skip-install --no-git --template pages
cat /tmp/vinext-scoped/wrangler.jsonc | grep name
```

Expected: Worker name = `vinext-scoped`.

- [ ] **Step 4: Run full repo checks**

```bash
vp check
```

Expected: No new lint, format, or type errors.

- [ ] **Step 5: Fix and commit any issues**

If the build or tests reveal issues, fix them and commit.

---

### Task 15: Acceptance checklist

Verify against the spec's acceptance criteria:

- [ ] `npm create vinext-app@latest my-app --yes` scaffolds a working project (both templates)
- [ ] `vp dev` responds with HTTP 200 in the scaffolded project
- [ ] `vp build` succeeds (RSC + SSR + client for App Router, SSR for Pages Router)
- [ ] CLI handles bare names, scoped names (`@org/app`), relative paths, absolute paths, and `.` (current dir)
- [ ] All tests pass (unit, integration, scaffolding, CLI)
- [ ] CI scaffolds and validates both templates on ubuntu and windows
- [ ] Publish workflow ships both vinext and create-vinext-app together
- [ ] README updated, "Not a goal" line about `create-next-app` scaffolding removed

---

## Summary

| Task                     | Commits         | Core files                                            |
| ------------------------ | --------------- | ----------------------------------------------------- |
| 1. Package scaffolding   | 1               | `package.json`, `tsconfig.json`, `vitest.config.ts`   |
| 2. install.ts (TDD)      | 1               | `src/install.ts`, `test/cli.test.ts`                  |
| 3. validate.ts (TDD)     | 1               | `src/validate.ts`, `test/cli.test.ts`                 |
| 4. catalog.ts (TDD)      | 1               | `src/catalog.ts`, `test/cli.test.ts`                  |
| 5. scaffold.ts (TDD)     | 1               | `src/scaffold.ts`, `test/scaffold.test.ts`            |
| 6. prompts.ts            | 1               | `src/prompts.ts`                                      |
| 7. index.ts (TDD)        | 1               | `src/index.ts`, `test/cli.test.ts`                    |
| 8. App Router template   | 1               | `templates/app-router/` (11 files)                    |
| 9. Pages Router template | 1               | `templates/pages-router/` (~15 files)                 |
| 10. Integration tests    | 1               | `test/integration.test.ts`                            |
| 11. CI workflow          | 1               | `.github/workflows/ci.yml`                            |
| 12. Publish workflow     | 1               | `.github/workflows/publish.yml`                       |
| 13. README               | 1               | `README.md`                                           |
| 14. Build & verify       | 0-1             | —                                                     |
| **Total**                | **~15 commits** | **~7 source files, ~26 template files, 3 test files** |
