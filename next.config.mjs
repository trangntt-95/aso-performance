/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Route /api/ga4-daily/run chạy các script build/push (node thuần, không import
    // package) bằng tiến trình con trên Vercel → phải kèm chúng vào bundle của function.
    outputFileTracingIncludes: {
      '/api/ga4-daily/run': ['./scripts/net-value/*.mjs'],
    },
  },
};

export default nextConfig;
