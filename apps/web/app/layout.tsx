import Script from "next/script";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/src/providers";

const fontSans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  title: "DaemonChat",
  description: "AI 长期助手",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className={`${fontSans.variable} ${fontDisplay.variable} min-h-screen`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
