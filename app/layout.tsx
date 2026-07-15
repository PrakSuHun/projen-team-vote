import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "프로젠 팀 투표",
  description: "프로젠 행사 팀 투표 및 집계",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
