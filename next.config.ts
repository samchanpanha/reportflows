import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["fontkit", "pdfkit"],
};

export default nextConfig;
