/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@businessbox/shared"],
  output: "standalone",
};

export default nextConfig;
