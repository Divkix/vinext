# create-vinext-app

Scaffold a new vinext project on Cloudflare Workers.

## Usage

```bash
# Interactive — prompts for project name and template
npm create vinext-app

# Quick start with defaults (App Router)
npm create vinext-app my-app --yes

# Choose template explicitly
npm create vinext-app my-app --template pages
```

## Options

| Flag                      | Description                        |
| ------------------------- | ---------------------------------- |
| `--yes`, `-y`             | Skip all prompts and use defaults  |
| `--template <app\|pages>` | Choose App Router or Pages Router  |
| `--skip-install`          | Skip dependency installation       |
| `--no-git`                | Skip git repository initialization |
| `--help`, `-h`            | Show help                          |
| `--version`, `-v`         | Show version                       |

## Templates

**App Router** (`--template app`)

- Next.js App Router file-system routing
- React Server Components
- API routes
- Optimized for Cloudflare Workers

**Pages Router** (`--template pages`)

- Traditional Next.js Pages Router
- Client-side navigation
- Full middleware/routing/SSR support
- API routes

Both templates include:

- TypeScript
- Vite 8 + vinext plugin
- `@cloudflare/vite-plugin` for Workers deployment
- Wrangler configuration
- Pre-configured scripts (`dev`, `build`, `preview`)

## What is vinext?

vinext is a Vite plugin that reimplements the Next.js API surface for deployment to Cloudflare Workers. It gives you the Next.js developer experience (routing, SSR, RSC, server actions) with Vite's build tooling.

**Key features:**

- File-system routing (`app/` or `pages/`)
- Server Components and Server Actions
- Edge-first architecture
- KV-backed caching (ISR)
- Cloudflare Bindings (D1, R2, KV, AI, etc.)

Read more at [github.com/cloudflare/vinext](https://github.com/cloudflare/vinext).

## Requirements

- Node.js 18+ (or compatible runtime)
- npm, pnpm, yarn, or bun (auto-detected)
- A Cloudflare account for deployment (optional for local dev)

## Deployment

After scaffolding:

```bash
cd my-app
npm run dev      # Local development
npm run build    # Production build
npm run preview  # Preview with Wrangler
```

To deploy to Cloudflare Workers, add your account ID to `wrangler.jsonc`, then:

```bash
npx wrangler deploy
```

Or use the vinext CLI's built-in deploy command (requires vinext package):

```bash
npx vinext deploy
```

## License

MIT
