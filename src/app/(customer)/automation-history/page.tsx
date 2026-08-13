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
import type { AutomationRule, AutomationRun } from "@/types"

type AutomationRunRow = AutomationRun & {
  automation_rules?: Pick<AutomationRule, "id" | "name" | "type"> | null
}

const statusLabels: Record<AutomationRun["status"], string> = {
  running: "Çalışıyor",
  completed: "Tamamlandı",
  failed: "Hata",
  review_required: "İnceleme Gerekli",
}

const statusTones: Record<AutomationRun["status"], "warning" | "success" | "danger" | "info"> = {
  running: "info",
  completed: "success",
  failed: "danger",
  review_required: "warning",
}

export default function AutomationHistoryPage() {
  const [runs, setRuns] = useState<AutomationRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error: runsError } = await supabase
      .from("automation_runs")
      .select("*, automation_rules(id,name,type)")
      .order("started_at", { ascending: false })
      .limit(100)

    if (runsError) {
      setError("Otomasyon geçmişi yüklenemedi.")
      setLoading(false)
      return
    }

    setRuns((data ?? []) as AutomationRunRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => ({
    candidates: runs.reduce((sum, run) => sum + run.candidate_count, 0),
    completed: runs.filter((run) => run.status === "completed").length,
    review: runs.filter((run) => run.status === "review_required" || run.status === "failed").length,
  }), [runs])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Geçmişi" description="Çalıştırılan otomasyonları ve aday sonuçlarını izleyin." />
        <LoadingState variant="table" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Otomasyon Geçmişi" description="Çalıştırılan otomasyonları ve aday sonuçlarını izleyin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Geçmişi"
        description="Çalıştırılan otomasyonları ve aday sonuçlarını izleyin."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğa Git</Button></Link>
            <Link href="/automations"><Button>Otomasyonlar</Button></Link>
          </>
        }
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Geçmiş Görünümü" tone="info" />
          <span className="font-semibold">Bu fazda gerçek çalışma kayıtları görüntülenir.</span>
        </div>
        <p className="mt-2">Worker henüz bağlanmadığı için yeni çalışma kaydı bu ekrandan oluşturulmaz.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Toplam Aday" value={stats.candidates} description="Çalışmalardan üretilen aday" tone="blue" />
        <StatCard title="Tamamlanan" value={stats.completed} description="Başarıyla biten çalışma" tone="emerald" />
        <StatCard title="İncelenecek" value={stats.review} description="Hata veya manuel inceleme" tone="amber" />
      </div>

      <Card title="Çalışma Kayıtları">
        {runs.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Otomasyon</Th>
                <Th>Çalışma Tarihi</Th>
                <Th>Durum</Th>
                <Th>Eşleşen</Th>
                <Th>Aday</Th>
                <Th>Başlangıç</Th>
                <Th>Hata</Th>
              </Tr>
            </THead>
            <TBody>
              {runs.map((run) => (
                <Tr key={run.id}>
                  <Td>
                    <div className="font-medium text-gray-950">{run.automation_rules?.name || "Otomasyon"}</div>
                    <div className="mt-1 text-xs text-gray-500">Doğum günü</div>
                  </Td>
                  <Td className="text-sm text-gray-500">{run.run_date}</Td>
                  <Td><StatusBadge label={statusLabels[run.status]} tone={statusTones[run.status]} /></Td>
                  <Td>{run.matched_count}</Td>
                  <Td>{run.candidate_count}</Td>
                  <Td className="text-sm text-gray-500">{new Date(run.started_at).toLocaleString("tr-TR")}</Td>
                  <Td className="max-w-xs truncate text-sm text-gray-500" title={run.error_message || undefined}>
                    {run.error_code || run.error_message || "-"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">OG</span>}
            title="Otomasyon geçmişi yok"
            description="Worker/RPC entegrasyonu çalıştığında gerçek çalışma kayıtları burada listelenecek."
            action={<Link href="/automations"><Button variant="secondary">Otomasyonlara Git</Button></Link>}
          />
        )}
      </Card>
    </div>
  )
}
