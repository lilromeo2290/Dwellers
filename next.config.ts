import type { NextConfig } from "next";

/**
 * Dwellers — Next.js configuration.
 *
 * Known technical debt (documented in ARCHITECTURE.md):
 *  - typescript.ignoreBuildErrors is inherited from the scaffold and must be
 *    disabled (set to false) once the codebase reaches full type coverage.
 *
 * Security headers are ALSO set at runtime in src/proxy.ts; duplicating the
 * static ones here covers static assets served without the proxy path.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true, // TODO(tech-debt): remove after type-coverage pass
  },
  reactStrictMode: false,
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
