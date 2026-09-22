import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app never renders next/image, so keep the Image Optimization API
  // (and its sharp/libvips surface) out of the deployed attack surface.
  images: { unoptimized: true },
};

export default nextConfig;
