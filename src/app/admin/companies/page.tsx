"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
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

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Firma Yönetimi</h1>

      <Card>
        <div className="flex gap-3">
          <Input
            placeholder="Firma adı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleCreate}>Firma Ekle</Button>
        </div>
      </Card>

      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>Vergi No</Th>
              <Th>Telefon</Th>
              <Th>Kredi</Th>
              <Th>Durum</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.tax_no || "-"}</Td>
                <Td>{c.phone || "-"}</Td>
                <Td>{credits[c.id] ?? 0}</Td>
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
