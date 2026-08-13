"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import type { AutomationRule, Group, SmsTemplate } from "@/types"

type AutomationRuleRow = AutomationRule & {
  groups?: Pick<Group, "id" | "name"> | null
  sms_templates?: Pick<SmsTemplate, "id" | "name"> | null
}

const offsetLabels: Record<AutomationRule["day_offset"], string> = {
  0: "Aynı gün",
  1: "1 gün önce",
  7: "7 gün önce",
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error: rulesError } = await supabase
      .from("automation_rules")
      .select("*, groups(id,name), sms_templates(id,name)")
      .order("created_at", { ascending: false })

    if (rulesError) {
      setError("Otomasyon kuralları yüklenemedi.")
      setLoading(false)
      return
    }

    setRules((data ?? []) as AutomationRuleRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.status === "active").length
    const manualApproval = rules.filter((rule) => rule.requires_approval).length
    const birthday = rules.filter((rule) => rule.type === "birthday").length

    return { active, manualApproval, birthday }
  }, [rules])

  const updateStatus = async (rule: AutomationRuleRow, status: AutomationRule["status"]) => {
    setUpdatingId(rule.id)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from("automation_rules")
      .update({ status })
      .eq("id", rule.id)

    setUpdatingId(null)
    if (updateError) {
      toast.error("Otomasyon durumu güncellenemedi.")
      return
    }

    toast.success(status === "active" ? "Otomasyon aktif edildi" : "Otomasyon pasifleştirildi")
    load()
  }

  const deleteRule = async (rule: AutomationRuleRow) => {
    const confirmed = window.confirm(`${rule.name} otomasyonu silinecek. Devam edilsin mi?`)
    if (!confirmed) return

    setUpdatingId(rule.id)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", rule.id)

    setUpdatingId(null)
    if (deleteError) {
      toast.error("Otomasyon silinemedi.")
      return
    }

    toast.success("Otomasyon silindi")
    load()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyonlar" description="Doğum günü ve özel gün SMS otomasyon kurallarınızı yönetin." />
        <LoadingState variant="table" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyonlar" description="Doğum günü ve özel gün SMS otomasyon kurallarınızı yönetin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyonlar"
        description="Doğum günü ve özel gün SMS otomasyon kurallarınızı yönetin."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Gör</Button></Link>
            <Link href="/automations/new"><Button>Otomasyon Oluştur</Button></Link>
          </>
        }
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Kural Kaydı Aktif" tone="info" />
          <span className="font-semibold">Bu fazda yalnız otomasyon kuralları kaydedilir.</span>
        </div>
        <p className="mt-2">Aday üretimi, manuel onay kuyruğu ve SMS kampanya aktarımı sonraki fazda bağlanacak. Bu ekrandan otomatik SMS gönderilmez.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Toplam Otomasyon" value={rules.length} description="Kayıtlı kural sayısı" tone="blue" />
        <StatCard title="Aktif" value={stats.active} description="Çalışmaya hazır kurallar" tone={stats.active > 0 ? "emerald" : "slate"} />
        <StatCard title="Manuel Onaylı" value={stats.manualApproval} description="İlk sürüm için güvenli mod" tone="amber" />
        <StatCard title="Doğum Günü" value={stats.birthday} description="Desteklenen ilk otomasyon tipi" tone="slate" />
      </div>

      <Card title="Otomasyon Listesi">
        {rules.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Otomasyon</Th>
                <Th>Hedef</Th>
                <Th>Şablon</Th>
                <Th>Zaman</Th>
                <Th>Durum</Th>
                <Th>Son Çalışma</Th>
                <Th></Th>
              </Tr>
            </THead>
            <TBody>
              {rules.map((rule) => (
                <Tr key={rule.id}>
                  <Td>
                    <div className="font-medium text-gray-950">{rule.name}</div>
                    <div className="mt-1 text-xs text-gray-500">Doğum günü</div>
                  </Td>
                  <Td className="text-sm text-gray-600">{rule.groups?.name || "Tüm kişiler"}</Td>
                  <Td className="text-sm text-gray-600">{rule.sms_templates?.name || "Özel mesaj"}</Td>
                  <Td>
                    <div className="text-sm text-gray-950">{offsetLabels[rule.day_offset]}</div>
                    <div className="mt-1 text-xs text-gray-500">{rule.send_time.slice(0, 5)} / {rule.timezone}</div>
                  </Td>
                  <Td>
                    <StatusBadge label={rule.status === "active" ? "Aktif" : "Pasif"} tone={rule.status === "active" ? "success" : "neutral"} />
                  </Td>
                  <Td className="text-sm text-gray-500">{rule.last_run_on || "-"}</Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      {rule.status === "active" ? (
                        <Button variant="secondary" size="sm" disabled={updatingId === rule.id} onClick={() => updateStatus(rule, "inactive")}>
                          Pasifleştir
                        </Button>
                      ) : (
                        <Button variant="secondary" size="sm" disabled={updatingId === rule.id} onClick={() => updateStatus(rule, "active")}>
                          Aktifleştir
                        </Button>
                      )}
                      <Button variant="danger" size="sm" disabled={updatingId === rule.id} onClick={() => deleteRule(rule)}>
                        Sil
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">OT</span>}
            title="Henüz otomasyon kuralı yok"
            description="Doğum günü SMS otomasyonu için ilk kuralınızı oluşturun. Bu fazda SMS gönderimi yapılmaz."
            action={<Link href="/automations/new"><Button>Otomasyon Oluştur</Button></Link>}
          />
        )}
      </Card>
    </div>
  )
}
