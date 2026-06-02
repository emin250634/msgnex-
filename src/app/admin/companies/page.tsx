"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { Company, SmsCredit } from "@/types"

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [credits, setCredits] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false })
    const { data: credits } = await supabase.from("sms_credits").select("*")

    const creditMap: Record<string, number> = {}
    credits?.forEach((c: SmsCredit) => { creditMap[c.company_id] = c.balance })

    setCompanies(companies ?? [])
    setCredits(creditMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from("companies").insert({ name: newName.trim() }).select().single()
    if (data) {
      await supabase.from("sms_credits").insert({ company_id: data.id, balance: 0 })
    }
    setNewName("")
    load()
  }

  const handleApproveSender = async (id: string) => {
    const supabase = createClient()
    await supabase.from("companies").update({ sender_approved: true }).eq("id", id)
    toast.success("SMS başlığı onaylandı")
    load()
  }

  const handleUpdateSender = async (id: string, name: string) => {
    const supabase = createClient()
    await supabase.from("companies").update({ sender_name: name, sender_approved: false }).eq("id", id)
    toast.success("SMS başlığı güncellendi, tekrar onay gerekli")
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Firma Yönetimi</h1>

      <Card title="Yeni Firma Ekle">
        <div className="flex gap-3">
          <Input
            placeholder="Firma adı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleCreate}>Firma Ekle</Button>
        </div>
      </Card>

      <Card title="Firmalar">
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>SMS Başlığı</Th>
              <Th>Başlık Onayı</Th>
              <Th>Kredi</Th>
              <Th>Durum</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>
                  <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                    {c.sender_name || "Ayarlanmamış"}
                  </span>
                </Td>
                <Td>
                  {c.sender_name ? (
                    c.sender_approved ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                        Onaylı
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => handleApproveSender(c.id)}>
                        Onayla
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </Td>
                <Td><span className="font-bold text-primary-600">{credits[c.id] ?? 0}</span></Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    c.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {c.is_active ? "Aktif" : "Pasif"}
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
