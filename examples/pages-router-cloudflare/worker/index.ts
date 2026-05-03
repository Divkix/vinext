/**
 * Cloudflare Worker entry point for vinext Pages Router.
 *
 * Delegates to vinext's built-in pages-router-entry handler which
 * handles the full request lifecycle: open-redirect guard, basePath
 * stripping, trailing slash normalization, config redirects/headers,
 * middleware, rewrites, API routes, SSR rendering, and static assets.
 */
import handler from "vinext/server/pages-router-entry";

export default {
  async fetch(request: Request): Promise<Response> {
    return handler.fetch(request);
  },
};
