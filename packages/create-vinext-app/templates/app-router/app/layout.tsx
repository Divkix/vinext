// @ts-nocheck -- template file, modules resolved in scaffolded project
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "{{DISPLAY_NAME}}",
  description: "Built with vinext",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
