import type { Metadata } from "next"
import "./globals.css"
import { ToastContainer } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "Msgnex - B2B Toplu SMS Platformu",
  description: "Kurumsal toplu SMS gönderim platformu",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-gray-50 antialiased">
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
