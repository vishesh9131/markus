import { DM_Sans, Libre_Baskerville } from "next/font/google";
import { DialogProvider } from "../components/Dialog";
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
      <head>
        {/* set theme before paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('markus-studio-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
