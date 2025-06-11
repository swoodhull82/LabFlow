import type {NextConfig} from 'next';

const repoName = 'LabFlow'; // Set your repository name here

const nextConfig: NextConfig = {
  output: 'export', // Add this line for static export
  basePath: `/${repoName}`, 
  assetPrefix: `/${repoName}/`,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true, // Add this line to disable image optimization for static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
