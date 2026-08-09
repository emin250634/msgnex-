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
import { PLAN_LABELS } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import type { Company } from "@/types"

interface CompanyOnboardingSummary {
  company_id: string
  progress: number
  status: "pilot_ready" | "provider_blocked" | "data_needed" | "test_campaign_needed" | "in_progress"
  next_step: string
}

const companyStatuses = [
  { value: "pending_provider_setup", label: "Provider Bekliyor" },
  { value: "pending_review", label: "Inceleme Bekliyor" },
  { value: "active", label: "Aktif" },
  { value: "suspended", label: "Askida" },
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

function onboardingLabel(status: CompanyOnboardingSummary["status"]) {
  const labels = {
    pilot_ready: "Pilot Hazır",
    provider_blocked: "Provider Eksik",
    data_needed: "Veri Bekliyor",
    test_campaign_needed: "Test Bekliyor",
    in_progress: "Kurulum Sürüyor",
  }
  return labels[status] || status
}

function onboardingTone(status: CompanyOnboardingSummary["status"]) {
  if (status === "pilot_ready") return "success" as const
  if (status === "provider_blocked") return "danger" as const
  if (status === "data_needed" || status === "test_campaign_needed") return "warning" as const
  return "info" as const
}

function salesStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    new: "Yeni",
    contacted: "Görüşüldü",
    pilot: "Pilot",
    won: "Kazanıldı",
    lost: "Kaybedildi",
  }
  return labels[status || "new"] || status || "Yeni"
}

function salesStatusTone(status?: string | null) {
  if (status === "won") return "success" as const
  if (status === "lost") return "danger" as const
  if (status === "pilot") return "info" as const
  if (status === "contacted") return "warning" as const
  return "neutral" as const
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [onboarding, setOnboarding] = useState<Record<string, CompanyOnboardingSummary>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    companyName: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    status: "pending_provider_setup",
    plan: "starter",
  })

  const load = async () => {
    const supabase = createClient()
    const [{ data: companies }, { data: onboardingRows }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.rpc("list_admin_company_onboarding"),
    ])
    setCompanies(companies ?? [])
    setOnboarding(Object.fromEntries(((onboardingRows ?? []) as CompanyOnboardingSummary[]).map((row) => [row.company_id, row])))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!form.companyName.trim() || !form.ownerName.trim() || !form.ownerEmail.trim()) {
      toast.error("Firma adi, yetkili adi ve yetkili e-posta zorunludur")
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
        plan: form.plan,
      }),
    })
    const payload = await response.json().catch(() => ({ error: "Firma olusturulamadi" }))
    setSaving(false)

    if (!response.ok) {
      toast.error(payload.error || "Firma olusturulamadi")
      return
    }

    setForm({
      companyName: "",
      ownerName: "",
      ownerEmail: "",
      phone: "",
      status: "pending_provider_setup",
      plan: "starter",
    })
    toast.success("Firma olusturuldu ve owner daveti gonderildi")
    load()
  }

  const handleDelete = async (company: Company) => {
    const confirmed = window.confirm(
      `${company.name} firmasini kalici olarak silmek istiyor musunuz? Firmaya bagli veriler ve baska firmaya bagli olmayan firma kullanicilari da silinir.`
    )
    if (!confirmed) return

    setDeletingId(company.id)
    const response = await fetch(`/api/admin/companies/${company.id}`, { method: "DELETE" })
    const payload = await response.json().catch(() => ({ error: "Firma silinemedi" }))
    setDeletingId(null)

    if (!response.ok) {
      toast.error(payload.error || "Firma silinemedi")
      return
    }

    toast.success("Firma kalici olarak silindi")
    load()
  }

  if (loading) return <p>Yukleniyor...</p>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firma Yonetimi"
        description="Firmalari olusturun, ilk firma yetkilisini davet edin ve musteri hesaplarini yonetin."
      />

      <Card title="Yeni Firma ve Owner Daveti">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Input
            label="Firma adi"
            placeholder="Firma adi"
            value={form.companyName}
            onChange={(event) => setForm({ ...form, companyName: event.target.value })}
          />
          <Input
            label="Yetkili adi"
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
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
            <select
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value })}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {Object.entries(PLAN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={handleCreate} disabled={saving}>
          {saving ? "Olusturuluyor..." : "Firma Olustur ve Davet Gonder"}
        </Button>
      </Card>

      <Card title="Firmalar">
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>Telefon</Th>
              <Th>Plan</Th>
              <Th>Satış</Th>
              <Th>Onboarding</Th>
              <Th>Durum</Th>
              <Th>Aksiyon</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((company) => {
              const summary = onboarding[company.id]
              return (
                <Tr key={company.id}>
                  <Td className="font-medium">{company.name}</Td>
                  <Td>{company.phone || "-"}</Td>
                  <Td>{PLAN_LABELS[company.plan || "starter"]}</Td>
                  <Td>
                    <div className="min-w-32">
                      <StatusBadge label={salesStatusLabel(company.sales_status)} tone={salesStatusTone(company.sales_status)} />
                      {company.expected_monthly_sms_volume && (
                        <p className="mt-1 text-xs text-gray-500">{company.expected_monthly_sms_volume}/ay</p>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {summary ? (
                      <div className="min-w-40">
                        <div className="flex items-center gap-2">
                          <StatusBadge label={onboardingLabel(summary.status)} tone={onboardingTone(summary.status)} />
                          <span className="text-sm font-semibold text-gray-700">%{summary.progress}</span>
                        </div>
                        <p className="mt-1 max-w-56 truncate text-xs text-gray-500">{summary.next_step}</p>
                      </div>
                    ) : "-"}
                  </Td>
                  <Td>
                    <StatusBadge
                      label={statusLabel(company.status, company.is_active)}
                      tone={statusTone(company.status, company.is_active)}
                    />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/companies/${company.id}`}>
                        <Button variant="secondary" size="sm">Detay</Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deletingId === company.id}
                        onClick={() => handleDelete(company)}
                      >
                        {deletingId === company.id ? "Siliniyor..." : "Sil"}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
