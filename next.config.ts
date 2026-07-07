import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_META_APP_ID: process.env.META_APP_ID,
    NEXT_PUBLIC_META_CONFIG_ID: process.env.META_CONFIG_ID,
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SHOPIFY_APP_URL ||
      "http://localhost:3000",
  },
};

export default nextConfig;
