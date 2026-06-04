import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { automationRuns, automationTypeLabels } from "@/lib/automation/mock-data"

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR")
}

function statusLabel(status: string) {
  if (status === "completed") return "Tamamlandı"
  if (status === "failed") return "Hatalı"
  return "İncelenecek"
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const
  if (status === "failed") return "danger" as const
  return "warning" as const
}

export default function AutomationHistoryPage() {
  const totalCandidates = automationRuns.reduce((total, run) => total + run.candidateCount, 0)
  const totalApproved = automationRuns.reduce((total, run) => total + run.approvedCount, 0)
  const reviewCount = automationRuns.filter((run) => run.status === "review").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyon Geçmişi"
        description="Çalıştırılan otomasyonları ve oluşan aday sonuçlarını izleyin."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğa Git</Button></Link>
            <Link href="/automations"><Button>Otomasyonlar</Button></Link>
          </>
        }
      />

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard title="Toplam Aday" value={totalCandidates} description="Hazırlık kayıtları" tone="blue" />
        <StatCard title="Onaylanan" value={totalApproved} description="Gönderime hazır adaylar" tone="emerald" />
        <StatCard title="İncelenecek" value={reviewCount} description="Kontrol bekleyen çalışma" tone="amber" />
      </div>

      <Card title="Çalışma Kayıtları">
        {automationRuns.length > 0 ? (
          <Table>
            <THead>
              <Tr>
                <Th>Otomasyon</Th>
                <Th>Tür</Th>
                <Th>Çalışma Zamanı</Th>
                <Th>Aday</Th>
                <Th>Onaylanan</Th>
                <Th>Reddedilen</Th>
                <Th>Durum</Th>
              </Tr>
            </THead>
            <TBody>
              {automationRuns.map((run) => (
                <Tr key={run.id}>
                  <Td className="font-semibold text-gray-950">{run.automationName}</Td>
                  <Td><StatusBadge label={automationTypeLabels[run.type]} tone={run.type === "birthday" ? "purple" : "info"} /></Td>
                  <Td>{formatDate(run.runAt)}</Td>
                  <Td className="font-semibold text-gray-950">{run.candidateCount}</Td>
                  <Td className="font-semibold text-emerald-700">{run.approvedCount}</Td>
                  <Td className="font-semibold text-red-700">{run.rejectedCount}</Td>
                  <Td><StatusBadge label={statusLabel(run.status)} tone={statusTone(run.status)} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">OG</span>}
            title="Otomasyon geçmişi yok"
            description="Otomasyonlar çalıştırıldığında sonuç kayıtları burada görünecek."
            action={<Link href="/automations"><Button variant="secondary">Otomasyonlara Git</Button></Link>}
          />
        )}
      </Card>
    </div>
  )
}
