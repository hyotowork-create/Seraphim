/** @type {import('next').NextConfig} */
const nextConfig = {
  // 서버 액션/route handler에서 파일시스템(증빙 저장) 접근 필요
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
