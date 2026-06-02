import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"

export default async function AdminDashboard() {
  const supabase = await createClient()

  const { count: companyCount } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })

  const { count: userCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })

  const { count: smsCount } = await supabase
    .from("sms_messages")
    .select("*", { count: "exact", head: true })

  const { data: recentCompanies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

  const stats = [
    {
      title: "Firmalar",
      value: companyCount ?? 0,
      desc: "Kayıtlı firma",
      color: "from-blue-500 to-blue-600",
      icon: (
        <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: "Kullanıcılar",
      value: userCount ?? 0,
      desc: "Aktif kullanıcı",
      color: "from-emerald-500 to-emerald-600",
      icon: (
        <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
    },
    {
      title: "Toplam SMS",
      value: smsCount ?? 0,
      desc: "Gönderilen SMS",
      color: "from-purple-500 to-purple-600",
      icon: (
        <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">Sistem genel durumu</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.title}
            className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{s.title}</p>
                <div className={`rounded-lg bg-gradient-to-br ${s.color} p-2.5 shadow-sm`}>
                  {s.icon}
                </div>
              </div>
              <p className="mt-4 text-3xl font-bold text-gray-900">{s.value}</p>
              <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Card title="Son Eklenen Firmalar">
        {recentCompanies && recentCompanies.length > 0 ? (
          <div className="space-y-3">
            {recentCompanies.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone || "Telefon yok"}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  c.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {c.is_active ? "Aktif" : "Pasif"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">Henüz firma bulunmuyor.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
