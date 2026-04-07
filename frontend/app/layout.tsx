import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Code Understanding Engine",
    template: "%s · AI Code Engine",
  },
  description:
    "Sign in with GitHub, pick a repository, then run Tree-sitter AST + static analysis, Gemini insights, and explore graphs.",
  keywords: [
    "code analysis",
    "refactoring",
    "Tree-sitter",
    "Gemini",
    "static analysis",
    "dependency graph",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
