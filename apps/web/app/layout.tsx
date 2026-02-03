import "./globals.css";
import { AppProviders } from "@/src/providers";

export const metadata = {
  title: "DaemonChat",
  description: "AI 长期助手",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
