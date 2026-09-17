import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// Geist is the typeface used throughout the Figma file. The `geist` package
// bundles the variable font and loads it through next/font/local, so the
// build never depends on Google Fonts and every environment renders the same.

export const metadata: Metadata = {
  title: { default: "Toph", template: "%s · Toph" },
  description: "Farm activity logs, transcribed from the field.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
