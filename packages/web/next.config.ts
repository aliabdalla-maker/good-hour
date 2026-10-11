import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gihtcx/shared"],
  // Don't advertise the framework in every response.
  poweredByHeader: false,
};

export default nextConfig;
