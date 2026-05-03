# Spec: create-vinext-app Scaffolding CLI

**Issue:** [#407](https://github.com/cloudflare/vinext/issues/407)
**Date:** 2026-05-02
**Status:** awaiting review

## Goal

A standalone CLI package — `packages/create-vinext-app/` — that scaffolds a working vinext project with one command: `npm create vinext-app@latest my-app --yes`. No manual steps, no Next.js dependency required.

## Motivation

- `vinext init` is for migrating existing Next.js projects; it's the wrong tool for starting fresh
- A fresh project should not require Next.js to be installed to get bootstrapped
- The README currently says `create-next-app` scaffolding is "Not a goal" — this changes that
- Aligns vinext with the established `npm create` convention used by Next.js, Vite, Astro, etc.

## Architecture

Approach: Standalone CLI + embedded templates. No changes to the `vinext` package itself (except publish workflow coordination). Templates are self-contained projects stored alongside the CLI source.

```
packages/create-vinext-app/
  package.json          # name: "create-vinext-app", bin -> dist/index.js
  tsconfig.json         # Compile src/ -> dist/
  src/
    index.ts            # Main entry, arg parsing, help text, wiring
    validate.ts         # Project name validation, path resolution, empty dir check
    prompts.ts          # @clack/prompts interactive UI (name + template select)
    scaffold.ts         # Copy template, substitute .tmpl vars, rename _gitignore
    install.ts          # Package manager detection, install command builder
    catalog.ts          # Read pnpm-workspace.yaml catalog at build time, supply versions
  templates/
    app-router/         # Standalone vinext App Router project
    pages-router/       # Standalone vinext Pages Router project
  test/
    cli.test.ts         # Arg parsing, validation, edge cases
    scaffold.test.ts    # Template substitution, file operations
    integration.test.ts # End-to-end scaffold + dev server check
```

**Dependencies:** Node >= 18, pure ESM (`"type": "module"`). Runtime deps: `@clack/prompts`. Dev deps: `vite-plus` (types, test). No framework deps.

**Build:** `vp pack` compiles `src/` to `dist/` and copies `templates/` to `dist/templates/`. Template `.tmpl` processing happens at scaffold time, not build time. `catalog.ts` is a build-time module that reads `pnpm-workspace.yaml` to bake version numbers into the compiled output. It resolves npm aliases (e.g., `"vite": "npm:@voidzero-dev/vite-plus-core@0.1.17"` → `0.1.17`) to extract actual version ranges.

## Template: App Router

```
templates/app-router/
  package.json          # Dependencies with baked versions from catalog
  tsconfig.json         # Standard vinext tsconfig (ES2022, bundler, react-jsx)
  vite.config.ts        # vinext() + cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } })
  wrangler.jsonc        # main: "vinext/server/app-router-entry", assets binding
  _gitignore            # Renamed to .gitignore at scaffold
  app/
    layout.tsx          # Root layout with basic HTML structure
    page.tsx            # Welcome page
    globals.css          # Minimal reset
  worker/
    index.ts            # Thin wrapper: import handler from "vinext/server/app-router-entry"; export default { fetch: handler.fetch }
  public/
    favicon.ico          # Placeholder
```

**Dependencies (baked from catalog at build time):**

- `vinext` (^{VINEXT_VERSION} — synced with CLI version)
- `@vitejs/plugin-rsc`, `react-server-dom-webpack`, `react`, `react-dom`, `@vitejs/plugin-react`
- `@cloudflare/vite-plugin`, `vite`, `wrangler`
- Dev: `@cloudflare/workers-types`, `vite-plus`, `typescript`

**Scripts:** `"dev": "vp dev"`, `"build": "vp build"`, `"preview": "vp preview"`

**wrangler.jsonc** uses `"vinext/server/app-router-entry"` as the main entry — no custom worker needed for basic usage. The worker file exists as a convenience wrapper for customization.

**vite.config.ts:**

```ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  plugins: [vinext(), cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } })],
});
```

## Template: Pages Router

```
templates/pages-router/
  package.json          # Simpler deps (no RSC packages)
  tsconfig.json         # Standard vinext tsconfig
  vite.config.ts        # vinext() + cloudflare() (no RSC env config)
  wrangler.jsonc        # main: "./worker/index.ts"
  _gitignore
  pages/
    index.tsx           # Home page
    about.tsx           # Simple about page
    api/
      hello.ts          # API route returning JSON
  worker/
    index.ts            # ~150-line worker: middleware, config matching, SSR
  public/
    favicon.ico
```

**Dependencies:** Same as App Router minus `@vitejs/plugin-rsc` and `react-server-dom-webpack`.

**Scripts:** `"dev": "vp dev"`, `"build": "vp build"`, `"preview": "vp preview"`

**worker/index.ts** (~150 lines) implements the fetch handler:

1. Protocol-relative URL blocking
2. basePath stripping
3. Trailing slash normalization
4. Config redirects **before** middleware
5. `runMiddleware()` — response headers, rewrite/redirect/Early Hints handling
6. `x-middleware-request-*` header unpacking into request headers
7. Config headers (applied after middleware, with Set-Cookie merging)
8. `beforeFiles` rewrites
9. API route handling
10. `afterFiles` rewrites
11. Page SSR with `fallback` rewrite support
12. `mergeHeaders()` wrapper for middleware + config headers

This is a simplified version of `examples/pages-router-cloudflare/worker/index.ts` (246 lines), dropping image optimization and ASSETS binding. A follow-up issue will extract this logic into `vinext/server/pages-router-entry`.

**vite.config.ts:**

```ts
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({ plugins: [vinext(), cloudflare()] });
```

## CLI Architecture

### Entry point (`src/index.ts`)

**Flags:** `--template <app|pages>`, `--yes`/`-y`, `--skip-install`, `--no-git`, `--help`/`-h`, `--version`/`-v`, positional `[project-name]`.

**Flow:**

1. Parse args → help/version exit early
2. Interactive mode (via `@clack/prompts`) unless `--yes` or non-TTY → prompt for project name + template selection
3. Cancel-safe: Ctrl+C during prompts exits gracefully
4. Resolve project path: handle `.` (cwd), absolute paths, relative paths, scoped names
5. Validate project name (see validation rules below)
6. Detect package manager from `npm_config_user_agent`
7. Scaffold: copy template, substitute `.tmpl` variables, rename `_gitignore`, optional `git init` + `npm install`
8. Print success message with next steps (`cd`, `install`, `dev`)

### Version Baking (`src/catalog.ts`)

At CLI build time, reads `pnpm-workspace.yaml` from the monorepo root and extracts version ranges from the `catalog:` block. Maps catalog keys to template variable names. The baked versions are embedded in the compiled `scaffold.js`.

The catalog is read from the monorepo root at build time (`path.resolve(__dirname, "../../..")`). This means the CLI build must run within the monorepo (always true in CI/dev). `vinext` version comes from the CLI's own `package.json` version (always synced since publish bumps both together).

### Template Variable Substitution

| Variable                   | Source                                           | Example         |
| -------------------------- | ------------------------------------------------ | --------------- |
| `{{PROJECT_NAME}}`         | User input (preserves casing from validation)    | `my-vinext-app` |
| `{{WORKER_NAME}}`          | Sanitized: lowercase, alphanumeric, hyphens only | `my-vinext-app` |
| `{{VINEXT_VERSION}}`       | CLI's own package.json version                   | `^0.0.5`        |
| `{{RSC_VERSION}}`          | Catalog: `@vitejs/plugin-rsc`                    | `^0.5.23`       |
| `{{RSDW_VERSION}}`         | Catalog: `react-server-dom-webpack`              | `^19.2.5`       |
| `{{REACT_VERSION}}`        | Catalog: `react`                                 | `^19.2.5`       |
| `{{REACT_DOM_VERSION}}`    | Catalog: `react-dom`                             | `^19.2.5`       |
| `{{PLUGIN_REACT_VERSION}}` | Catalog: `@vitejs/plugin-react`                  | `^6.0.1`        |
| `{{CF_PLUGIN_VERSION}}`    | Catalog: `@cloudflare/vite-plugin`               | `^1.31.0`       |
| `{{CF_TYPES_VERSION}}`     | Catalog: `@cloudflare/workers-types`             | `^4.0.0`        |
| `{{VITE_VERSION}}`         | Catalog: `vite` (resolved from npm alias)        | `^0.1.17`       |
| `{{VITE_PLUS_VERSION}}`    | Catalog: `vite-plus`                             | `0.1.17`        |
| `{{WRANGLER_VERSION}}`     | Catalog: `wrangler`                              | `^4.80.0`       |
| `{{TS_VERSION}}`           | Catalog: `typescript`                            | `^5.7.0`        |

Substitution: recursively walk all files in the scaffolded project. Files ending in `.tmpl` get variable substitution and the `.tmpl` extension stripped. Non-`.tmpl` files are copied as-is. `_gitignore` is renamed to `.gitignore`.

### Validation Rules

- Not empty
- Not reserved (`node_modules`, `favicon.ico`, `package.json`, `package-lock.json`)
- ≤ 214 characters
- No spaces
- Only `[a-zA-Z0-9\-._@/]`
- Scoped names (`@scope/name`): scope must be `[a-z0-9-]+`, name must start with alphanumeric
- Cannot start with a number or hyphen
- Auto-normalize to lowercase
- `.` resolves to current directory (derives name from `path.basename(cwd)`)
- Target directory must be empty or contain only ignorable files (`.git`, `.DS_Store`, `.gitkeep`, `Thumbs.db`)

## CI Integration

### New `create-vinext-app` job (`.github/workflows/ci.yml`)

Added as a sibling to the existing `create-next-app` job. Both templates tested on ubuntu and windows.

**Steps:**

1. Checkout + setup (Vite+)
2. Build plugin (`vp run build` — builds both vinext and create-vinext-app)
3. Pack both packages for local install (`vp pm pack`)
4. Scaffold App Router project (`node ... --template app --yes --skip-install`)
5. Install deps with local vinext tarball (`vp add vinext-*.tgz` + `vp install`)
6. Start dev server and curl for HTTP 200 (30s timeout, port 3099)
7. Repeat steps 4-6 for Pages Router template

The job gates on `[check, test-unit, test-integration-merge, create-next-app]` passing first, and is added to the `ci` gate job's `needs` array.

## Publish Workflow

### `.github/workflows/publish.yml` updates

After the existing vinext build + bump + publish steps, add:

1. Build `create-vinext-app`: `vp run build --filter create-vinext-app`
2. Bump version to match vinext: `npm version $VERSION --no-git-tag-version`
3. Publish with OIDC trusted publishing: `vp pm publish --no-git-checks --access public -- --provenance`

Both packages share the same version number, published in the same workflow run.

## README Updates

1. **"Starting a new vinext project" section** (line 87-91): Replace with:

   ```bash
   npm create vinext-app@latest
   ```

   And document the `--template` and `--yes` flags.

2. **"What's NOT supported" section** (line 554): Remove `- **create-next-app scaffolding** — Not a goal.`

3. Update the migration skill's compatibility docs (`migrate-to-vinext/references/compatibility.md`) if it references `create-next-app` scaffolding.

## Testing

### Unit tests (`test/cli.test.ts`)

- `parseArgs()` — all flag combinations, invalid templates, unknown flags, positional names
- `validateProjectName()` — empty, reserved, length, spaces, characters, scoped names, leading numbers/hyphens, auto-lowercase, `.` → useCwd
- `resolveProjectPath()` — absolute paths, relative paths, `.` → cwd
- `detectPackageManager()` — parse `npm_config_user_agent` for npm/pnpm/yarn/bun, unknown → npm
- `buildInstallCommand()` — correct command per PM
- `sanitizeWorkerName()` — scoped, uppercase, special chars, leading/trailing hyphens, consecutive hyphens

### Scaffolding tests (`test/scaffold.test.ts`)

- Using temp directories with dependency injection (`_exec` parameter)
- Template variable substitution: all variables substituted, `.tmpl` extension stripped, handles nested dirs
- `_gitignore` → `.gitignore` renaming
- Git init and install are skippable via flags

### Integration tests (`test/integration.test.ts`)

- Full `main()` call with `--yes --skip-install --no-git`
- Both templates: all expected files present, `.tmpl` files processed, no leftover template markers
- `package.json` has correct name, scripts, and dependency structure

### CI-level E2E (new `create-vinext-app` job)

- Scaffolds both templates on ubuntu + windows
- Installs deps with local vinext tarball
- Starts dev server and curls for HTTP 200

### Edge Cases

| Input                            | Expected                                        |
| -------------------------------- | ----------------------------------------------- |
| `my-app`                         | Valid, scaffolds `my-app/`                      |
| `My-App`                         | Auto-lowercases to `my-app`                     |
| `@org/my-app`                    | Valid scoped name, `{{WORKER_NAME}}` = `my-app` |
| `./relative/path`                | Resolves relative to cwd                        |
| `/absolute/path`                 | Resolves absolute                               |
| `.`                              | Uses cwd, derives name from dir                 |
| `___`                            | Name with underscores valid                     |
| `123abc`                         | Rejected: starts with number                    |
| `-leading`                       | Rejected: starts with hyphen                    |
| `existing-dir/` (non-empty)      | Rejected: directory not empty                   |
| `existing-dir/` (only .DS_Store) | Allowed (ignorable file)                        |
| `--template invalid`             | Error + exit code 1                             |
| `--yes --template pages`         | Non-interactive pages template                  |
| Ctrl+C during prompts            | Graceful exit, no error                         |
| scoped name `@org/`              | Rejected if name part is empty                  |

## Acceptance Criteria

- [ ] `npm create vinext-app@latest my-app --yes` scaffolds a working project (both templates)
- [ ] `vp dev` responds with HTTP 200 in the scaffolded project
- [ ] `vp build` succeeds (RSC + SSR + client for App Router, SSR for Pages Router)
- [ ] CLI handles bare names, scoped names (`@org/app`), relative paths, absolute paths, and `.` (current dir)
- [ ] All tests pass (unit, integration, scaffolding, CLI)
- [ ] CI scaffolds and validates both templates on ubuntu and windows
- [ ] Publish workflow ships both vinext and create-vinext-app together
- [ ] README updated, "Not a goal" line about `create-next-app` scaffolding removed

## Files / Areas NOT Modified

- `packages/vinext/src/` — No changes to the vinext plugin itself
- `examples/` — Example apps remain unchanged (follow-up extraction of `pages-router-entry` is separate)
- `packages/vinext/package.json` — Only the publish workflow touches vinext packaging
- Existing test fixtures — Not modified
- `.github/workflows/ci.yml` jobs other than adding `create-vinext-app`
- `.github/workflows/deploy-examples.yml`, `.github/workflows/ecosystem.yml`, etc. — Not modified

## Follow-up Work (Out of Scope)

- Extract `pages-router-entry` into `vinext/server/pages-router-entry` so both the template and `examples/pages-router-cloudflare` share the same worker logic
- Extract `app-router-entry` into `vinext/server/app-router-entry` (already exists, but template could use it more directly)
- Add `--template` options for deployment targets beyond Cloudflare Workers
- Add template for static export / SPA mode
