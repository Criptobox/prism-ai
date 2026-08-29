import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  // vista previa de Arena (host *.e2b.app) y recarga en caliente
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
