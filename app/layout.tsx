import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fira-sans",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Observatório Eleitoral",
  description: "Dashboard responsivo de acompanhamento e análise dos dados eleitorais públicos."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={firaSans.variable}>{children}</body>
    </html>
  );
}
