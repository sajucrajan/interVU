/** @type {import('next').NextConfig} */

/**
 * Same-origin API proxy (deployment, docs/11).
 *
 * The session cookie is `sameSite: "lax"`, which is the right default — but it
 * means the browser will not send it to a different *site*. Free hosts publish
 * every service under its own subdomain of a Public Suffix List domain
 * (`a.koyeb.app`, `b.koyeb.app`), so two services there are cross-site and a
 * login would appear to succeed while every later request came back
 * unauthenticated.
 *
 * Proxying instead of relaxing the cookie: with `API_PROXY_TARGET` set, the
 * browser only ever talks to the web origin, so the cookie stays first-party,
 * CORS disappears, and `lax` keeps its CSRF protection. Unset locally, where
 * the web app calls the API directly on :4000.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig = {
  reactStrictMode: true,
  // Minimal server bundle for the container image (apps/web/Dockerfile).
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  ...(apiProxyTarget
    ? {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${apiProxyTarget}/api/v1/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
