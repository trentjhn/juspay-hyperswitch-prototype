import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Turnstile", template: "%s | Turnstile" },
  description: "Event ticketing prototype on Juspay Hyperswitch",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Turnstile
            </Link>
            <span className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600">
              Hyperswitch sandbox
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
        <footer className="border-t border-zinc-200">
          <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-zinc-500">
            Prototype. Payments run against the Juspay Hyperswitch sandbox; no real money moves.
          </div>
        </footer>
      </body>
    </html>
  );
}
