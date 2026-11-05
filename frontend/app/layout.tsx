import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxora — Dubbing Studio",
  description: "Free, open-source video and audio dubbing studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
