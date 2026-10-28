import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teele Abi",
  description: "Õppedemo Teele kasutajatoe päringutele vastuse mustandite koostamiseks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="et">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div
          role="note"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
        >
          Õppedemo – ära sisesta päris päringuid ega isikuandmeid.
        </div>
        {children}
        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
          © 2026 Teele Abi. Built with Claude Code
        </footer>
      </body>
    </html>
  );
}
