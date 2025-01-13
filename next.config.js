/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly expose the environment variable
  experimental: {
    // Enable runtime configuration
    runtime: 'nodejs'
  }
}

module.exports = nextConfig 