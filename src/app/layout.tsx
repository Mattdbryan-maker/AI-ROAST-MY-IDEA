import type { Metadata, Viewport } from "next";
import { Anton, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AI ROAST MY IDEA — put your idea on trial",
  description:
    "Pitch your startup idea to a panel of four AI critics. Get roasted, scored out of 100, and handed a verdict: KILL IT, FIX IT or BUILD IT.",
  openGraph: {
    title: "AI ROAST MY IDEA",
    description: "Think your idea is good? Let the AI panel destroy it.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anton.variable} ${grotesk.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
