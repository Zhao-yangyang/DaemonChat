import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@daemon/adapters-llm-vercel",
    "@daemon/adapters-queue",
    "@daemon/adapters-supabase",
    "@daemon/api",
    "@daemon/domain",
    "@daemon/hooks",
    "@daemon/sdk",
    "@daemon/ui",
  ],
};

export default withNextIntl(nextConfig);
