/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly expose the environment variable
  experimental: {
    // Enable runtime configuration
    runtime: 'nodejs'
  },
  // Add rewrites to proxy the RPC requests
  async rewrites() {
    return {
      fallback: [
        {
          source: '/api/rpc',
          destination: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
        },
      ],
    }
  },
}

module.exports = nextConfig 