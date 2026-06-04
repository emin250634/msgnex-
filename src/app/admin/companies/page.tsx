"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { Company, SmsCredit } from "@/types"

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [credits, setCredits] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [editingSenderId, setEditingSenderId] = useState<string | null>(null)
  const [senderName, setSenderName] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false })
    const { data: credits } = await supabase.from("sms_credits").select("*")
    const creditMap: Record<string, number> = {}
    credits?.forEach((credit: SmsCredit) => { creditMap[credit.company_id] = credit.balance })
    setCompanies(companies ?? [])
    setCredits(creditMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    const companyName = newName.trim()
    if (!companyName) return
    const supabase = createClient()
    const { data, error } = await supabase.from("companies").insert({
      name: companyName,
      sender_name: companyName.slice(0, 11),
      sender_approved: false,
    }).select().single()
    if (error) {
      toast.error(error.message)
      return
    }
    await supabase.from("sms_credits").insert({ company_id: data.id, balance: 0 })
    setNewName("")
    toast.success("Firma oluşturuldu")
    load()
  }

  const handleApproveSender = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("companies").update({ sender_approved: true }).eq("id", id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("SMS başlığı onaylandı")
    load()
  }

  const handleUpdateSender = async (id: string) => {
    const normalized = senderName.trim()
    if (!normalized || normalized.length > 11) {
      toast.error("SMS başlığı 1-11 karakter olmalıdır")
      return
    }
    const supabase = createClient()
    const { error } = await supabase.from("companies").update({
      sender_name: normalized,
      sender_approved: false,
    }).eq("id", id)
    if (error) {
      toast.error(error.message)
      return
    }
    setEditingSenderId(null)
    setSenderName("")
    toast.success("SMS başlığı güncellendi, tekrar onay gerekli")
    load()
  }

  const startSenderEdit = (company: Company) => {
    setEditingSenderId(company.id)
    setSenderName(company.sender_name || company.name.slice(0, 11))
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firma Yönetimi"
        description="Müşteri firmalarını, sender başlıklarını ve kredi durumlarını yönetin."
      />

      <Card title="Yeni Firma Ekle">
        <div className="flex gap-3">
          <Input placeholder="Firma adı" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={handleCreate}>Firma Ekle</Button>
        </div>
      </Card>

      <Card title="Firmalar">
        <Table>
          <THead>
            <Tr><Th>Firma</Th><Th>SMS Başlığı</Th><Th>Başlık Onayı</Th><Th>Kredi</Th><Th>Durum</Th></Tr>
          </THead>
          <TBody>
            {companies.map((company) => (
              <Tr key={company.id}>
                <Td className="font-medium">{company.name}</Td>
                <Td>
                  {editingSenderId === company.id ? (
                    <div className="flex min-w-[340px] items-center gap-2">
                      <Input value={senderName} maxLength={11} onChange={(e) => setSenderName(e.target.value)} />
                      <Button size="sm" onClick={() => handleUpdateSender(company.id)}>Kaydet</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingSenderId(null)}>İptal</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm">
                        {company.sender_name || "Ayarlanmamış"}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => startSenderEdit(company)}>Düzenle</Button>
                    </div>
                  )}
                </Td>
                <Td>
                  {company.sender_name ? (
                    company.sender_approved ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Onaylı</span>
                    ) : (
                      <Button size="sm" onClick={() => handleApproveSender(company.id)}>Onayla</Button>
                    )
                  ) : <span className="text-xs text-gray-400">-</span>}
                </Td>
                <Td><span className="font-bold text-primary-600">{credits[company.id] ?? 0}</span></Td>
                <Td>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    company.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {company.is_active ? "Aktif" : "Pasif"}
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
