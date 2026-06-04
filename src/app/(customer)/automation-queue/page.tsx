"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { automationCandidates, type AutomationCandidateMock, type QueueStatus } from "@/lib/automation/mock-data"

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR")
}

function statusLabel(status: QueueStatus) {
  if (status === "approved") return "Onaylandı"
  if (status === "rejected") return "Reddedildi"
  return "Bekliyor"
}

function statusTone(status: QueueStatus) {
  if (status === "approved") return "success" as const
  if (status === "rejected") return "danger" as const
  return "warning" as const
}

export default function AutomationQueuePage() {
  const [candidates, setCandidates] = useState<AutomationCandidateMock[]>(automationCandidates)

  const counts = useMemo(() => ({
    pending: candidates.filter((candidate) => candidate.status === "pending").length,
    approved: candidates.filter((candidate) => candidate.status === "approved").length,
    rejected: candidates.filter((candidate) => candidate.status === "rejected").length,
  }), [candidates])

  const setStatus = (id: string, status: QueueStatus) => {
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, status } : candidate))
  }

  const approveAll = () => {
    setCandidates((current) => current.map((candidate) => candidate.status === "pending" ? { ...candidate, status: "approved" } : candidate))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Kuyruğu"
        description="Otomasyonların ürettiği aday SMS'leri gönderimden önce kontrol edin."
        actions={
          <>
            <Link href="/automations"><Button variant="secondary">Otomasyonlar</Button></Link>
            <Button onClick={approveAll} disabled={counts.pending === 0}>Tümünü Onayla</Button>
          </>
        }
      />

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Bekleyen" value={counts.pending} description="Onay bekleyen aday" tone="amber" />
        <StatCard title="Onaylanan" value={counts.approved} description="Kampanyaya dönüşmeye hazır" tone="emerald" />
        <StatCard title="Reddedilen" value={counts.rejected} description="Gönderim dışı bırakıldı" tone="rose" />
      </div>

      <Card title="Bekleyen Adaylar">
        {candidates.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Kişi</Th>
                <Th>Otomasyon</Th>
                <Th>Segment</Th>
                <Th>Mesaj Önizleme</Th>
                <Th>Planlanan</Th>
                <Th>Durum</Th>
                <Th></Th>
              </Tr>
            </THead>
            <TBody>
              {candidates.map((candidate) => (
                <Tr key={candidate.id}>
                  <Td>
                    <p className="font-semibold text-gray-950">{candidate.contactName}</p>
                    <p className="mt-1 text-xs text-gray-500">{candidate.phone}</p>
                  </Td>
                  <Td>{candidate.automationName}</Td>
                  <Td><StatusBadge label={candidate.segmentName} tone={candidate.segmentName.toLowerCase().includes("vip") ? "purple" : "info"} /></Td>
                  <Td>
                    <p className="max-w-sm text-sm leading-6 text-gray-600">{candidate.messagePreview}</p>
                  </Td>
                  <Td>{formatDate(candidate.scheduledFor)}</Td>
                  <Td><StatusBadge label={statusLabel(candidate.status)} tone={statusTone(candidate.status)} /></Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" disabled={candidate.status !== "pending"} onClick={() => setStatus(candidate.id, "approved")}>Onayla</Button>
                      <Button variant="danger" size="sm" disabled={candidate.status !== "pending"} onClick={() => setStatus(candidate.id, "rejected")}>Reddet</Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="Kuyruk boş" description="Otomasyon adayları oluştuğunda burada listelenecek." />
        )}
      </Card>

      <Card title="Gönderime Dönüşüm Notu">
        <p className="text-sm leading-6 text-gray-600">
          Bu MVP ekranında onaylanan adaylar yalnızca UI durumunu değiştirir. Gerçek sürümde onaylanan adaylar mevcut kampanya/gönderim akışına aktarılmalıdır.
        </p>
      </Card>
    </div>
  )
}
