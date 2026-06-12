import "./globals.css";

export const metadata = {
  title: "Markus Studio — write .mks, preview LaTeX & PDF live",
  description:
    "An Overleaf-style live editor for Markus: Markdown-like manuscripts compiled to LaTeX-quality PDFs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
