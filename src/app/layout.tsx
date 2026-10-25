import { NavigationTiming } from "@/components/navigation/navigation-timing";
import {Suspense} from 'react';
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BackNavigation } from "@/components/navigation/back-navigation";
import "./globals.css";
import "./polish.css";
import { AppShell } from "@/components/navigation/app-shell";
import { MaintenancePopup } from "@/components/service/maintenance-popup";
import { ServiceAccessMonitor } from "@/components/service/service-access-monitor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "2001 Runners",
  description: "2001 Runners 크루 활동 관리 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><NavigationTiming /><ServiceAccessMonitor /><MaintenancePopup><AppShell><Suspense fallback={null}><BackNavigation /></Suspense>{children}</AppShell></MaintenancePopup></body>
    </html>
  );
}
