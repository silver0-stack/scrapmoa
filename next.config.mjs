/** @type {import('next').NextConfig} */
const nextConfig = {
  // jsdom의 하위 의존성(html-encoding-sniffer → @exodus/bytes)이 ESM 전용이라
  // Vercel 서버리스 번들에 그대로 포함시키면 require()/ESM 상호운용 에러가 난다.
  // 번들링 대상에서 빼고 런타임에 node_modules에서 직접 불러오게 한다.
  serverExternalPackages: ["jsdom"],
};

export default nextConfig;
