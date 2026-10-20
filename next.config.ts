import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering: every page reads the session, so keep it simple.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
