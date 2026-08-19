import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { NotificationInit } from "@/components/NotificationInit";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export const metadata: Metadata = {
  title: "SGA Skoda CRM",
  description: "Lead management CRM dashboard for SGA Skoda — track, manage, and close leads from Google Sheets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ImpersonationBanner />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
        <NotificationInit />
      </body>
    </html>
  );
}

