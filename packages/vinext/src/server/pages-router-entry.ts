/**
 * Default Cloudflare Worker entry point for vinext Pages Router.
 *
 * Use this directly in wrangler.jsonc:
 *   "main": "vinext/server/pages-router-entry"
 *
 * Or import and delegate to it from a custom worker:
 *   import handler from "vinext/server/pages-router-entry";
 *   return handler.fetch(request, env, ctx);
 *
 * This module handles the full Pages Router request lifecycle:
 * open-redirect guard → basePath strip → trailing slash → config redirects →
 * middleware → config headers → beforeFiles rewrites → API routes →
 * afterFiles rewrites → SSR rendering → fallback rewrites → static asset signals.
 */

import {
  renderPage,
  handleApiRoute,
  runMiddleware,
  vinextConfig,
  // @ts-expect-error -- virtual module resolved by vinext at build time
} from "virtual:vinext-server-entry";
import { runWithExecutionContext, type ExecutionContextLike } from "vinext/shims/request-context";
import { resolveStaticAssetSignal, mergeHeaders } from "./worker-utils.js";
import { isOpenRedirectShaped, applyConfigHeadersToHeaderRecord } from "./request-pipeline.js";
import {
  matchRedirect,
  matchRewrite,
  requestContextFromRequest,
  applyMiddlewareRequestHeaders,
  isExternalUrl,
  proxyExternalRequest,
  sanitizeDestination,
} from "../config/config-matchers.js";
import { hasBasePath, stripBasePath } from "../utils/base-path.js";

// Extract config values (embedded at build time in the server entry)
const basePath: string = vinextConfig?.basePath ?? "";
const trailingSlash: boolean = vinextConfig?.trailingSlash ?? false;
const configRedirects = vinextConfig?.redirects ?? [];
const configRewrites = vinextConfig?.rewrites ?? { beforeFiles: [], afterFiles: [], fallback: [] };
const configHeaders = vinextConfig?.headers ?? [];

type WorkerAssetEnv = {
  ASSETS?: {
    fetch(request: Request): Promise<Response> | Response;
  };
};

export default {
  async fetch(
    request: Request,
    env?: WorkerAssetEnv,
    ctx?: ExecutionContextLike,
  ): Promise<Response> {
    // Wrap in runWithExecutionContext so downstream code (ISR, caching,
    // background revalidation) can reach ctx.waitUntil() without ctx being
    // threaded through every call site.
    const handleFn = () => handleRequest(request, env);
    return ctx ? runWithExecutionContext(ctx, handleFn) : handleFn();
  },
};

async function handleRequest(request: Request, env?: WorkerAssetEnv): Promise<Response> {
  try {
    const url = new URL(request.url);
    let pathname = url.pathname;
    const search = url.search;

    // ── 1. Block protocol-relative URL open redirects ────────────────────
    // Paths like //evil.com/, /%5Cevil.com/ would be echoed by trailing-slash
    // redirect emitters and resolved as protocol-relative by browsers.
    // Check the raw pathname BEFORE any decode/normalize so percent-encoded
    // variants (%5C, %2F) are also caught.
    if (isOpenRedirectShaped(pathname)) {
      return new Response("404 Not Found", { status: 404 });
    }

    // ── 2. Strip basePath ────────────────────────────────────────────────
    pathname = stripBasePath(pathname, basePath);

    // ── 3. Trailing slash normalization ──────────────────────────────────
    // /api routes and root / are never redirected. RSC requests (client-side
    // navigation) carry a .rsc extension and should not get trailing-slash
    // redirects either.
    if (
      pathname !== "/" &&
      pathname !== "/api" &&
      !pathname.startsWith("/api/") &&
      !pathname.endsWith(".rsc")
    ) {
      const hasTrailing = pathname.endsWith("/");
      if (trailingSlash && !hasTrailing) {
        return new Response(null, {
          status: 308,
          headers: { Location: basePath + pathname + "/" + search },
        });
      }
      if (!trailingSlash && hasTrailing) {
        return new Response(null, {
          status: 308,
          headers: { Location: basePath + pathname.replace(/\/+$/, "") + search },
        });
      }
    }

    const urlWithQuery = pathname + search;
    let resolvedUrl = urlWithQuery;

    // Build request context for pre-middleware config matching. Redirects and
    // header match conditions use the original request snapshot so they are
    // evaluated before any middleware transformations.
    const reqCtx = requestContextFromRequest(request);

    // ── 4. Apply config redirects (BEFORE middleware) ────────────────────
    if (configRedirects.length) {
      const redirect = matchRedirect(pathname, configRedirects, reqCtx);
      if (redirect) {
        // Guard against double-prefixing basePath on the destination.
        const dest = sanitizeDestination(
          basePath &&
            !isExternalUrl(redirect.destination) &&
            !hasBasePath(redirect.destination, basePath)
            ? basePath + redirect.destination
            : redirect.destination,
        );
        return new Response(null, {
          status: redirect.permanent ? 308 : 307,
          headers: { Location: dest },
        });
      }
    }

    // ── 5. Stripped request for middleware ───────────────────────────────
    // Middleware matchers must evaluate against the basePath-free pathname,
    // matching prod-server and deploy.ts behavior. Rebuild request with
    // the stripped pathname so runMiddleware sees e.g. /about, not /docs/about.
    if (basePath) {
      const strippedUrl = new URL(request.url);
      strippedUrl.pathname = pathname;
      request = new Request(strippedUrl, request);
    }

    // ── 6. Run middleware ────────────────────────────────────────────────
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
        if (result.response) {
          return result.response;
        }
      }

      // Collect middleware response headers to merge into the final response.
      // Set-Cookie values are stored as arrays (RFC 6265 forbids comma-joining).
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
      if (result.rewriteUrl) {
        resolvedUrl = result.rewriteUrl;
      }
      middlewareRewriteStatus = result.rewriteStatus;
    }

    // ── 7. Unpack x-middleware-request-* headers ─────────────────────────
    // These internal headers carry request header modifications from middleware.
    // applyMiddlewareRequestHeaders strips them from middlewareHeaders and
    // rebuilds the Request object with the forwarded header values.
    const { request: postMwReq, postMwReqCtx } = applyMiddlewareRequestHeaders(
      middlewareHeaders,
      request,
    );
    request = postMwReq;

    let resolvedPathname = resolvedUrl.split("?")[0];

    // ── 8. Apply config headers ──────────────────────────────────────────
    // Header match conditions use the original (pre-middleware) request context.
    // Middleware response headers win for the same key; multi-value headers
    // (Set-Cookie, Vary) are additive.
    if (configHeaders.length) {
      applyConfigHeadersToHeaderRecord(middlewareHeaders, {
        configHeaders,
        pathname,
        requestContext: reqCtx,
      });
    }

    if (isExternalUrl(resolvedUrl)) {
      return proxyExternalRequest(request, resolvedUrl);
    }

    // ── 9. Apply beforeFiles rewrites ────────────────────────────────────
    if (configRewrites.beforeFiles?.length) {
      const rewritten = matchRewrite(resolvedPathname, configRewrites.beforeFiles, postMwReqCtx);
      if (rewritten) {
        if (isExternalUrl(rewritten)) {
          return proxyExternalRequest(request, rewritten);
        }
        resolvedUrl = rewritten;
        resolvedPathname = rewritten.split("?")[0];
      }
    }

    // ── 10. API routes ──────────────────────────────────────────────────
    if (resolvedPathname.startsWith("/api/") || resolvedPathname === "/api") {
      const response =
        typeof handleApiRoute === "function"
          ? await handleApiRoute(request, resolvedUrl)
          : new Response("404 - API route not found", { status: 404 });
      return mergeHeaders(response, middlewareHeaders, middlewareRewriteStatus);
    }

    // ── 11. Apply afterFiles rewrites ────────────────────────────────────
    if (configRewrites.afterFiles?.length) {
      const rewritten = matchRewrite(resolvedPathname, configRewrites.afterFiles, postMwReqCtx);
      if (rewritten) {
        if (isExternalUrl(rewritten)) {
          return proxyExternalRequest(request, rewritten);
        }
        resolvedUrl = rewritten;
        resolvedPathname = rewritten.split("?")[0];
      }
    }

    // ── 12. SSR page rendering ──────────────────────────────────────────
    let response: Response | undefined;
    if (typeof renderPage === "function") {
      response = await renderPage(request, resolvedUrl, null);

      // ── 13. Fallback rewrites (if SSR returned 404) ───────────────────
      if (response && response.status === 404 && configRewrites.fallback?.length) {
        const fallbackRewrite = matchRewrite(
          resolvedPathname,
          configRewrites.fallback,
          postMwReqCtx,
        );
        if (fallbackRewrite) {
          if (isExternalUrl(fallbackRewrite)) {
            return proxyExternalRequest(request, fallbackRewrite);
          }
          response = await renderPage(request, fallbackRewrite, null);
        }
      }
    }

    if (!response) {
      return new Response("404 - Not found", { status: 404 });
    }

    // ── 14. Merge middleware headers, handle static file signals ─────────
    response = mergeHeaders(response, middlewareHeaders, middlewareRewriteStatus);

    // If an ASSETS binding is available, check for x-vinext-static-file
    // signals (emitted for public/ directory files).
    if (env?.ASSETS) {
      const assetResponse = await resolveStaticAssetSignal(response, {
        fetchAsset: (assetPath) =>
          Promise.resolve(env.ASSETS!.fetch(new Request(new URL(assetPath, request.url)))),
      });
      if (assetResponse) return assetResponse;
    }

    return response;
  } catch (error) {
    console.error("[vinext] Worker error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
