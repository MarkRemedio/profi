import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // ✅ ADDED SUPABASE FOR THE PRODUCT TOUR
      {
        protocol: "https",
        hostname: "rxjsvpddsfmghvgjpgwg.supabase.co",
      },
    ],
  },
  // 🚀 EXPAND SERVER ACTION SIZE LIMITS FOR BASE64 LOGOS & STATEMENT UPLOADS
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
