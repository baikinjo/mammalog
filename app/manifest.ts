import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "맘마로그 · 우리 아이 이유식",
    short_name: "맘마로그",
    description: "부부가 함께 쓰는 적응형 이유식 기록과 추천",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4ea",
    theme_color: "#f8f4ea",
    lang: "ko-KR",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
