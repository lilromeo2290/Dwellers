import type { NextConfig } from "next";

/**
 * Dwellers — Next.js configuration.
 *
 * Type safety is enforced: the compiler runs on every build and failures fail
 * the build (Phase 1 gate condition, resolved in Phase 2). Security headers
 * are ALSO set at runtime in src/proxy.ts; duplicating the static ones here
 * covers static assets served without the proxy path.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
