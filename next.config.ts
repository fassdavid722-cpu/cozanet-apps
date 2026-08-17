/** @type {import('next').NextConfig} */
const nextConfig = {
  // No NEXT_PUBLIC_API_URL override — frontend uses relative '/api/chat' by default
  // These packages use Node.js APIs and shouldn't be bundled by webpack
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'pyodide'],
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'pyodide'],
  },
  // Allow WASM files to be loaded
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
      });
    }
    return config;
  },
};

export default nextConfig;
