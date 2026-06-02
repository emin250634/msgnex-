import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function CustomerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "customer") redirect("/login")

  let companyName = "-"
  let creditsBalance = 0
  let contactCount = 0
  let smsCount = 0
  let recentMessages: any[] = []

  if (profile.company_id) {
    const { data: company } = await supabase
      .from("companies").select("name")
      .eq("id", profile.company_id).single()
    companyName = company?.name || "-"

    const { data: credits } = await supabase
      .from("sms_credits").select("balance")
      .eq("company_id", profile.company_id).single()
    creditsBalance = credits?.balance ?? 0

    const { count: cc } = await supabase
      .from("contacts").select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    contactCount = cc ?? 0

    const { count: sc } = await supabase
      .from("sms_messages").select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
    smsCount = sc ?? 0

    const { data: msgs } = await supabase
      .from("sms_messages").select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }).limit(5)
    recentMessages = msgs ?? []
  }

  const stats = [
    {
      title: "SMS Kredisi", value: creditsBalance, desc: "Kalan kredi",
      color: "from-blue-500 to-blue-600",
      icon: <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
    },
    {
      title: "Kişi Sayısı", value: contactCount, desc: "Kayıtlı kişi",
      color: "from-emerald-500 to-emerald-600",
      icon: <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      title: "Toplam SMS", value: smsCount, desc: "Gönderilen SMS",
      color: "from-purple-500 to-purple-600",
      icon: <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Hoş geldiniz, {profile.full_name}</p>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-gray-900">{companyName}</p>
          <p className="text-xs text-gray-500">Firma</p>
        </div>
      </div>

      {!profile.company_id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Firma bilgisi eksik. Lütfen admin ile iletişime geçin.
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.title} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{s.title}</p>
                <div className={`rounded-lg bg-gradient-to-br ${s.color} p-2.5 shadow-sm`}>{s.icon}</div>
              </div>
              <p className="mt-4 text-3xl font-bold text-gray-900">{s.value}</p>
              <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Son Gönderimler">
          {recentMessages.length > 0 ? (
            <div className="space-y-3">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{msg.recipient}</p>
                    <p className="truncate text-xs text-gray-500 max-w-xs">{msg.message}</p>
                  </div>
                  <span className={`ml-4 shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                    msg.status === "sent" || msg.status === "delivered"
                      ? "bg-green-100 text-green-700" : msg.status === "failed"
                      ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {msg.status === "sent" ? "Gönderildi" : msg.status === "delivered" ? "Teslim Edildi" : msg.status === "failed" ? "Hata" : "Bekliyor"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">Henüz SMS gönderimi yapılmamış.</p>
              <Link href="/sms">
                <Button className="mt-4" size="sm">İlk SMS'i Gönder</Button>
              </Link>
            </div>
          )}
        </Card>

        <Card title="Hızlı İşlemler">
          <div className="space-y-3">
            <Link href="/sms" className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
              <div className="rounded-lg bg-blue-100 p-2.5">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">SMS Gönder</p>
                <p className="text-xs text-gray-500">Toplu SMS gönderimi yapın</p>
              </div>
            </Link>
            <Link href="/contacts" className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
              <div className="rounded-lg bg-emerald-100 p-2.5">
                <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Kişi Ekle</p>
                <p className="text-xs text-gray-500">CSV ile toplu kişi yükleyin</p>
              </div>
            </Link>
            <Link href="/groups" className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors">
              <div className="rounded-lg bg-purple-100 p-2.5">
                <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Grup Oluştur</p>
                <p className="text-xs text-gray-500">Kişilerinizi gruplayın</p>
              </div>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
