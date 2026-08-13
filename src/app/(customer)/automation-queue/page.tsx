"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
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
import type { AutomationCandidate, AutomationRule, Contact } from "@/types"

type AutomationCandidateRow = AutomationCandidate & {
  automation_rules?: Pick<AutomationRule, "id" | "name" | "type"> | null
  contacts?: Pick<Contact, "id" | "first_name" | "last_name"> | null
}

const statusLabels: Record<AutomationCandidate["status"], string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  queued: "Kampanyaya Aktarıldı",
  skipped: "Atlandı",
}

const statusTones: Record<AutomationCandidate["status"], "warning" | "success" | "danger" | "info" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  queued: "info",
  skipped: "neutral",
}

export default function AutomationQueuePage() {
  const [candidates, setCandidates] = useState<AutomationCandidateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error: candidatesError } = await supabase
      .from("automation_candidates")
      .select("*, automation_rules(id,name,type), contacts(id,first_name,last_name)")
      .order("scheduled_for", { ascending: true })
      .limit(200)

    if (candidatesError) {
      setError("Otomasyon kuyruğu yüklenemedi.")
      setLoading(false)
      return
    }

    setCandidates((data ?? []) as AutomationCandidateRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => ({
    pending: candidates.filter((candidate) => candidate.status === "pending").length,
    approved: candidates.filter((candidate) => candidate.status === "approved").length,
    rejected: candidates.filter((candidate) => candidate.status === "rejected").length,
  }), [candidates])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Kuyruğu" description="Otomasyon adaylarını güvenli şekilde izleyin." />
        <LoadingState variant="table" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Kuyruğu" description="Otomasyon adaylarını güvenli şekilde izleyin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Kuyruğu"
        description="Otomasyon adaylarını güvenli şekilde izleyin."
        actions={
          <>
            <Link href="/automations"><Button variant="secondary">Otomasyonlar</Button></Link>
            <Button disabled>Tümünü Onayla</Button>
          </>
        }
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Kuyruk Görünümü" tone="info" />
          <span className="font-semibold">Bu fazda gerçek aday kayıtları görüntülenir.</span>
        </div>
        <p className="mt-2">Onayla, reddet ve kampanyaya aktar aksiyonları worker/RPC fazında aktif edilecek. Bu ekrandan SMS gönderilmez.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Bekleyen" value={stats.pending} description="Manuel inceleme bekleyen aday" tone="amber" />
        <StatCard title="Onaylanan" value={stats.approved} description="Henüz kampanyaya aktarılmaz" tone="emerald" />
        <StatCard title="Reddedilen" value={stats.rejected} description="Gönderim dışı bırakılan aday" tone="rose" />
      </div>

      <Card title="Otomasyon Adayları">
        {candidates.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Otomasyon</Th>
                <Th>Kişi</Th>
                <Th>Telefon</Th>
                <Th>Planlanan</Th>
                <Th>Durum</Th>
                <Th>Mesaj</Th>
              </Tr>
            </THead>
            <TBody>
              {candidates.map((candidate) => (
                <Tr key={candidate.id}>
                  <Td>
                    <div className="font-medium text-gray-950">{candidate.automation_rules?.name || "Otomasyon"}</div>
                    <div className="mt-1 text-xs text-gray-500">Doğum günü</div>
                  </Td>
                  <Td>{[candidate.contacts?.first_name, candidate.contacts?.last_name].filter(Boolean).join(" ") || "-"}</Td>
                  <Td className="font-mono text-sm">{candidate.phone}</Td>
                  <Td className="text-sm text-gray-500">{new Date(candidate.scheduled_for).toLocaleString("tr-TR")}</Td>
                  <Td><StatusBadge label={statusLabels[candidate.status]} tone={statusTones[candidate.status]} /></Td>
                  <Td className="max-w-sm truncate text-sm text-gray-600" title={candidate.message}>{candidate.message}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">OK</span>}
            title="Otomasyon kuyruğu boş"
            description="Aday üretimi worker/RPC fazında bağlandığında kayıtlar burada listelenecek."
            action={<Link href="/automations"><Button variant="secondary">Otomasyonlara Git</Button></Link>}
          />
        )}
      </Card>
    </div>
  )
}
