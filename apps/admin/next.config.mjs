/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@businessbox/shared", "@businessbox/contracts"],
  output: "standalone",
};

export default nextConfig;
