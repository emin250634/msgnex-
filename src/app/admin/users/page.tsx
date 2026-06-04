"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { Profile } from "@/types"

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false })
      const { data: companies } = await supabase.from("companies").select("id, name")

      const nameMap: Record<string, string> = {}
      companies?.forEach((c: any) => { nameMap[c.id] = c.name })

      setProfiles(profiles ?? [])
      setCompanyNames(nameMap)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kullanıcılar"
        description="Platform kullanıcılarını, rollerini ve firma bağlantılarını izleyin."
      />
      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Ad Soyad</Th>
              <Th>Rol</Th>
              <Th>Firma</Th>
              <Th>Durum</Th>
              <Th>Kayıt</Th>
            </Tr>
          </THead>
          <TBody>
            {profiles.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.full_name}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    p.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {p.role === "admin" ? "Admin" : "Müşteri"}
                  </span>
                </Td>
                <Td>{p.company_id ? companyNames[p.company_id] || "-" : "-"}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    p.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {p.is_active ? "Aktif" : "Pasif"}
                  </span>
                </Td>
                <Td className="text-sm text-gray-500">
                  {new Date(p.created_at).toLocaleDateString("tr-TR")}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
