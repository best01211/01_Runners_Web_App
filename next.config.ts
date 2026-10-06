import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-webpack" : ".next",
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
};

export default nextConfig;
