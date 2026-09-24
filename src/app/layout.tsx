import type { Metadata, Viewport } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "./globals.css";
import "../styles/legacy.css";
import "../styles/roulette.css";
import "../styles/plinko.css";
import "../styles/table-center.css";
import { VersionNotice } from "@/components/version-notice";

export const metadata: Metadata = {
  title: "MINUIT — Le casino entre amis.",
  description:
    "Six jeux, vos amis et la nuit devant vous. Blackjack, poker, roulette, Tower, Mine et Chicken en crédits fictifs.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100e18",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <VersionNotice />
      </body>
    </html>
  );
}
