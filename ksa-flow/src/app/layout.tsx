import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KSA-FLOW 자금집행·내부통제",
  description: "소규모 사단법인 자금집행 통제 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
