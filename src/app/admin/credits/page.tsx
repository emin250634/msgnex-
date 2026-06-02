"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { Company } from "@/types"

export default function CreditsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [credits, setCredits] = useState<Record<string, number>>({})
  const [selectedCompany, setSelectedCompany] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: companies } = await supabase.from("companies").select("*").order("name")
    const { data: credits } = await supabase.from("sms_credits").select("*")

    const creditMap: Record<string, number> = {}
    credits?.forEach((c: any) => { creditMap[c.company_id] = c.balance })

    setCompanies(companies ?? [])
    setCredits(creditMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAddCredits = async () => {
    if (!selectedCompany || !amount || parseInt(amount) <= 0) return
    const supabase = createClient()
    const val = parseInt(amount)

    const { data: profile } = await supabase.from("profiles").select("id").single()

    await supabase
      .from("sms_credits")
      .update({ balance: (credits[selectedCompany] || 0) + val })
      .eq("company_id", selectedCompany)

    await supabase.from("credit_transactions").insert({
      company_id: selectedCompany,
      amount: val,
      type: "add",
      note: note.trim() || "Admin tarafından kredi yüklemesi",
      created_by: profile?.id,
    })

    setAmount("")
    setNote("")
    toast.success(`${val} kredi yüklendi`)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Kredi Yönetimi</h1>

      <Card title="Kredi Yükle">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Seçiniz</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Mevcut: {credits[c.id] ?? 0}) {c.sender_name ? `- ${c.sender_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Kredi Miktarı"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
          <Input
            label="Açıklama (opsiyonel)"
            placeholder="Yükleme sebebi"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddCredits}>Yükle</Button>
        </div>
      </Card>

      <Card title="Firma Kredileri">
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>SMS Başlığı</Th>
              <Th>Mevcut Kredi</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>
                  <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                    {c.sender_name || "-"}
                  </span>
                </Td>
                <Td className="text-lg font-bold text-primary-600">{credits[c.id] ?? 0}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
