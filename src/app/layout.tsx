import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "react-hot-toast"

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
      <body>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
