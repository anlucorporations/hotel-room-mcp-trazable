import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Las imágenes se sirven por host/CDN (ADR-12); los remotePatterns se configuran en F1.
};

export default withNextIntl(nextConfig);
