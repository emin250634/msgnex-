"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import type { Company } from "@/types"

const companyStatuses = [
  { value: "pending_provider_setup", label: "Provider Bekliyor" },
  { value: "pending_review", label: "İnceleme Bekliyor" },
  { value: "active", label: "Aktif" },
  { value: "suspended", label: "Askıda" },
  { value: "rejected", label: "Reddedildi" },
]

function statusLabel(status?: string | null, isActive?: boolean) {
  if (!status) return isActive ? "Aktif" : "Pasif"
  return companyStatuses.find((item) => item.value === status)?.label || status
}

function statusTone(status?: string | null, isActive?: boolean) {
  if (status === "active" || (!status && isActive)) return "success" as const
  if (status === "suspended" || status === "rejected" || (!status && !isActive)) return "danger" as const
  return "warning" as const
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    companyName: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    status: "pending_provider_setup",
  })

  const load = async () => {
    const supabase = createClient()
    const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false })
    setCompanies(companies ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!form.companyName.trim() || !form.ownerName.trim() || !form.ownerEmail.trim()) {
      toast.error("Firma adı, yetkili adı ve yetkili e-posta zorunludur")
      return
    }

    setSaving(true)
    const response = await fetch("/api/admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: form.companyName,
        owner_name: form.ownerName,
        owner_email: form.ownerEmail,
        phone: form.phone,
        status: form.status,
      }),
    })
    const payload = await response.json().catch(() => ({ error: "Firma oluşturulamadı" }))
    setSaving(false)

    if (!response.ok) {
      toast.error(payload.error || "Firma oluşturulamadı")
      return
    }

    setForm({
      companyName: "",
      ownerName: "",
      ownerEmail: "",
      phone: "",
      status: "pending_provider_setup",
    })
    toast.success("Firma oluşturuldu ve owner daveti gönderildi")
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firma Yönetimi"
        description="Firmaları oluşturun, ilk firma yetkilisini davet edin ve müşteri hesaplarını yönetin."
      />

      <Card title="Yeni Firma ve Owner Daveti">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Firma adı"
            placeholder="Firma adı"
            value={form.companyName}
            onChange={(event) => setForm({ ...form, companyName: event.target.value })}
          />
          <Input
            label="Yetkili adı"
            placeholder="Ad soyad"
            value={form.ownerName}
            onChange={(event) => setForm({ ...form, ownerName: event.target.value })}
          />
          <Input
            label="Yetkili e-posta"
            type="email"
            placeholder="yetkili@firma.com"
            value={form.ownerEmail}
            onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })}
          />
          <Input
            label="Telefon"
            placeholder="05xxxxxxxxx"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Durum</label>
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {companyStatuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={handleCreate} disabled={saving}>
          {saving ? "Oluşturuluyor..." : "Firma Oluştur ve Davet Gönder"}
        </Button>
      </Card>

      <Card title="Firmalar">
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>Telefon</Th>
              <Th>SMS Başlığı</Th>
              <Th>Durum</Th>
              <Th>Aksiyon</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((company) => (
              <Tr key={company.id}>
                <Td className="font-medium">{company.name}</Td>
                <Td>{company.phone || "-"}</Td>
                <Td>
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm">
                    {company.sender_name || "Ayarlanmamış"}
                  </span>
                </Td>
                <Td>
                  <StatusBadge
                    label={statusLabel(company.status, company.is_active)}
                    tone={statusTone(company.status, company.is_active)}
                  />
                </Td>
                <Td>
                  <Link href={`/admin/companies/${company.id}`}>
                    <Button variant="secondary" size="sm">Detay</Button>
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
