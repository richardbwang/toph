import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Inter, self-hosted (variable weight, latin subset) so the build never depends
// on Google Fonts and the page renders the same font everywhere.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Toph", template: "%s · Toph" },
  description: "Farm activity logs, transcribed from the field.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
