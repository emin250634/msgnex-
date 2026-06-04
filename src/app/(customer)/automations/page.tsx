import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { automationRules, automationTypeLabels } from "@/lib/automation/mock-data"

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("tr-TR")
}

function typeTone(type: string) {
  if (type === "welcome") return "success" as const
  if (type === "birthday") return "purple" as const
  if (type === "inactive") return "warning" as const
  if (type === "payment") return "danger" as const
  return "info" as const
}

export default function AutomationsPage() {
  const activeCount = automationRules.filter((rule) => rule.status === "active").length
  const totalCandidates = automationRules.reduce((total, rule) => total + rule.candidateCount, 0)
  const approvalCount = automationRules.filter((rule) => rule.requiresApproval).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otomasyonlar"
        description="Hoş geldin, kampanya ve müşteri hatırlatma akışlarını manuel onaylı şekilde yönetin."
        actions={
          <>
            <Link href="/automation-queue"><Button variant="secondary">Kuyruğu Gör</Button></Link>
            <Link href="/automations/new"><Button>Otomasyon Oluştur</Button></Link>
          </>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Toplam Otomasyon" value={automationRules.length} description="Mock kurallar" tone="blue" />
        <StatCard title="Aktif" value={activeCount} description="Çalışmaya hazır akış" tone="emerald" />
        <StatCard title="Manuel Onaylı" value={approvalCount} description="Güvenli MVP modu" tone="amber" />
        <StatCard title="Aday Sayısı" value={totalCandidates} description="Onay bekleyen potansiyel" tone="slate" />
      </div>

      <Card title="Otomasyon Listesi">
        <Table>
          <THead>
            <Tr>
              <Th>Otomasyon</Th>
              <Th>Durum</Th>
              <Th>Tür</Th>
              <Th>Şablon</Th>
              <Th>Hedef Segment</Th>
              <Th>Son Çalışma</Th>
              <Th>Aday</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {automationRules.map((rule) => (
              <Tr key={rule.id}>
                <Td>
                  <p className="font-semibold text-gray-950">{rule.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{rule.requiresApproval ? "Manuel onay gerekir" : "Otomatik gönderim kapalı önizleme"}</p>
                </Td>
                <Td>
                  <StatusBadge label={rule.status === "active" ? "Aktif" : "Pasif"} tone={rule.status === "active" ? "success" : "neutral"} />
                </Td>
                <Td>
                  <StatusBadge label={automationTypeLabels[rule.type]} tone={typeTone(rule.type)} />
                </Td>
                <Td>{rule.templateName}</Td>
                <Td>{rule.segmentName}</Td>
                <Td>{formatDate(rule.lastRunAt)}</Td>
                <Td className="font-semibold text-gray-950">{rule.candidateCount}</Td>
                <Td className="text-right">
                  <Link href="/automation-queue"><Button variant="secondary" size="sm">Adayları Gör</Button></Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card title="MVP Çalışma Modeli">
        <div className="grid gap-4 text-sm text-gray-600 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Manuel onay</p>
            <p className="mt-1">Otomasyonlar aday üretir, gönderim kullanıcı onayından sonra ilerler.</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Mevcut altyapı</p>
            <p className="mt-1">SMS şablonu, segment ve kampanya yapısı bozulmadan kullanılacak şekilde tasarlandı.</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Canlıya hazırlık</p>
            <p className="mt-1">Gerçek otomasyon için tablo ve worker katmanı sonraki fazda eklenecek.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
