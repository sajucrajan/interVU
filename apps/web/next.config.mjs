/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Minimal server bundle for the container image (apps/web/Dockerfile).
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default nextConfig;
