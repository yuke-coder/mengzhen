/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // 信任Cloudflare代理，确保正确获取客户端IP和协议
  experimental: {
    trustHostHeader: true,
  },
  // 配置信任的代理
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Forwarded-Proto',
            value: 'https',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
