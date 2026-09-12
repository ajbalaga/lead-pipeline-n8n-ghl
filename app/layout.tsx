import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "BrightFix Home Services — Same-day quotes",
  description:
    "Plumbing, electrical, and HVAC service. Tell us what's going on and get a callback within the hour.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
