/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['tesseract.js', 'sharp'],
  outputFileTracingIncludes: {
    '/**/*': ['./node_modules/pdfkit/js/data/**', './node_modules/tesseract.js/**'],
  },
};

export default nextConfig;
