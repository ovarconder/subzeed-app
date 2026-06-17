import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large audio body for Whisper API
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // API route config
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default nextConfig;
