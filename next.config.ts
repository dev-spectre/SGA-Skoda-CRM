import type { NextConfig } from "next"; 

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/consultant',
        destination: '/consultants',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
