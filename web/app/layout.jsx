import { DM_Sans, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const libre = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata = {
  title: "Markus Studio — write .mks, preview LaTeX & PDF",
  description:
    "A live editor for Markus: Markdown-like manuscripts compiled to LaTeX-quality PDFs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${libre.variable}`}>
      <body>{children}</body>
    </html>
  );
}
