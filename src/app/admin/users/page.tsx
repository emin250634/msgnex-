"use client"

import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { Profile } from "@/types"

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    const supabase = createClient()
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false })
    const { data: companies } = await supabase.from("companies").select("id, name")

    const nameMap: Record<string, string> = {}
    companies?.forEach((company: any) => {
      nameMap[company.id] = company.name
    })

    setProfiles(profiles ?? [])
    setCompanyNames(nameMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (profile: Profile) => {
    const confirmed = window.confirm(`${profile.full_name || profile.email || "Bu kullanici"} kalici olarak silinsin mi?`)
    if (!confirmed) return

    setDeletingId(profile.id)
    const response = await fetch(`/api/admin/users/${profile.id}`, { method: "DELETE" })
    const payload = await response.json().catch(() => ({ error: "Kullanici silinemedi" }))
    setDeletingId(null)

    if (!response.ok) {
      toast.error(payload.error || "Kullanici silinemedi")
      return
    }

    toast.success("Kullanici kalici olarak silindi")
    load()
  }

  if (loading) return <p>Yukleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kullanicilar"
        description="Platform kullanicilarini, rollerini ve firma baglantilarini izleyin."
      />
      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Ad Soyad</Th>
              <Th>Rol</Th>
              <Th>Firma</Th>
              <Th>Durum</Th>
              <Th>Kayit</Th>
              <Th>Islem</Th>
            </Tr>
          </THead>
          <TBody>
            {profiles.map((profile) => (
              <Tr key={profile.id}>
                <Td className="font-medium">{profile.full_name}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    profile.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {profile.role === "admin" ? "Admin" : "Musteri"}
                  </span>
                </Td>
                <Td>{profile.company_id ? companyNames[profile.company_id] || "-" : "-"}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    profile.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {profile.is_active ? "Aktif" : "Pasif"}
                  </span>
                </Td>
                <Td className="text-sm text-gray-500">
                  {new Date(profile.created_at).toLocaleDateString("tr-TR")}
                </Td>
                <Td>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={profile.role === "admin" || deletingId === profile.id}
                    onClick={() => handleDelete(profile)}
                  >
                    {deletingId === profile.id ? "Siliniyor..." : "Sil"}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
