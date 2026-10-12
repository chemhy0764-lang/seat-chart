import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "자리 배치표",
  description: "짝꿍 분단형 교실 자리 배치표 만들기",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
