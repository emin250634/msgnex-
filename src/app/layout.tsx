import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "react-hot-toast"

export const metadata: Metadata = {
  metadataBase: new URL("https://msgnex.com"),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "MSGNEX | Kurumsal SMS ve İletişim Platformu",
    template: "%s | MSGNEX",
  },
  description: "Toplu SMS, SMS API, kampanya yönetimi, raporlama ve provider entegrasyonlarını tek panelden yönetin.",
  openGraph: {
    url: "/",
    title: "MSGNEX | Kurumsal SMS ve İletişim Platformu",
    description: "Kurumsal SMS operasyonlarınızı güvenli ve kontrollü biçimde tek panelden yönetin.",
    type: "website",
    locale: "tr_TR",
    images: [{ url: "/background.png", width: 1678, height: 944, alt: "MSGNEX iletişim platformu" }],
  },
  icons: { icon: "/logo.png", apple: "/logo.png" },
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
