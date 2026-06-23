import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    'crawlee',
    '@crawlee/cheerio',
    '@crawlee/core',
    '@crawlee/utils',
    '@crawlee/memory-storage',
    'got-scraping',
    'header-generator',
  ],
};

export default nextConfig;
