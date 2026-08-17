/** @type {import('next').NextConfig} */
const nextConfig = {
  // No NEXT_PUBLIC_API_URL override — frontend uses relative '/api/chat' by default
  // These packages use Node.js APIs and shouldn't be bundled by webpack
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
};

export default nextConfig;
