import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mem0ai optionally imports AWS Bedrock / sqlite / pg — don't bundle those into routes
  serverExternalPackages: ["mem0ai", "better-sqlite3", "pg"],
  env: {
    NEXT_PUBLIC_META_APP_ID: process.env.META_APP_ID,
    NEXT_PUBLIC_META_CONFIG_ID: process.env.META_CONFIG_ID,
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.SHOPIFY_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
  },
};

export default nextConfig;
