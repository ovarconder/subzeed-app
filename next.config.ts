import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // In Next.js 16, increase body size via serverActions only
};

export default nextConfig;

