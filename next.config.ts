import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // T3 serves this workspace through a fixed preview hostname in development.
  allowedDevOrigins: ["desktop-pcd162u.tailb7835f.ts.net"],
  turbopack: { root: process.cwd() },
};
export default config;
