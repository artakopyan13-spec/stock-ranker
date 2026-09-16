import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / node-only packages stay external to the server bundle.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "@prisma/adapter-pg", "pg", "yahoo-finance2"],
  async headers() {
    return [
      {
        source: "/s/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
