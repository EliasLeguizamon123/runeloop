import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.8'],
  experimental: { useTypeScriptCli: false },
}

export default nextConfig
