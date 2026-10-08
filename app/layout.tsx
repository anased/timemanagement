import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plan vs. Actual",
  description: "Compare your time-blocked calendar with how you actually spent your time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
