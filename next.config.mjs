/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Route /api/ga4-daily/run chạy lại các script pipeline bằng node con trên Vercel,
    // nên phải kèm chúng (và googleapis cùng phụ thuộc) vào bundle của function.
    outputFileTracingIncludes: {
      '/api/ga4-daily/run': [
        './scripts/net-value/*.mjs',
        './node_modules/googleapis/**',
        './node_modules/googleapis-common/**',
        './node_modules/google-auth-library/**',
        './node_modules/gaxios/**',
        './node_modules/gcp-metadata/**',
        './node_modules/gtoken/**',
        './node_modules/jws/**',
        './node_modules/jwa/**',
      ],
    },
  },
};

export default nextConfig;
