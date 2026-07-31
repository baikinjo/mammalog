import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const description =
    "부부가 함께 기록하고, 아이의 진행 상태에 맞춰 다음 이유식을 준비하는 개인용 이유식 앱";

  return {
    metadataBase: baseUrl,
    title: "차곡한끼 · 우리 아이의 첫 식사",
    description,
    applicationName: "차곡한끼",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "차곡한끼",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      title: "차곡한끼",
      description,
      images: [{ url: new URL("/og.png", baseUrl).toString(), width: 1200, height: 630, alt: "차곡한끼 — 우리 아이의 첫 식사를 차곡차곡" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "차곡한끼",
      description,
      images: [new URL("/og.png", baseUrl).toString()],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f8f4ea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
