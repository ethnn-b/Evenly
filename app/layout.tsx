import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Splitwise-OCR",
  description: "Split shared expenses, settle up, and scan receipts with OCR.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
