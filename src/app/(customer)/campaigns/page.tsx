"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { SmsCampaign } from "@/types"

const statusLabels: Record<SmsCampaign["status"], string> = {
  draft: "Taslak",
  queued: "Kuyrukta",
  scheduled: "Planlandı",
  sending: "Gönderiliyor",
  completed: "Tamamlandı",
  failed: "Hata",
  cancelled: "İptal Edildi",
  review_required: "İnceleme Gerekli",
}

const statusClasses: Record<SmsCampaign["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  sending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  review_required: "bg-orange-100 text-orange-700",
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("sms_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
    setCampaigns(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCancel = async (id: string) => {
    if (!window.confirm("Bu kampanya iptal edilsin mi? Ayrılan kredi bakiyenize iade edilecek.")) return
    const supabase = createClient()
    const { data, error } = await supabase.rpc("cancel_queued_sms_campaign", {
      p_campaign_id: id,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`${data.refund} kredi iade edildi`)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kampanyalar</h1>
          <p className="text-sm text-gray-500">Toplu SMS gönderimlerinin durumunu takip edin.</p>
        </div>
        <Button variant="secondary" onClick={load}>Yenile</Button>
      </div>
      <Card title="Son Kampanyalar">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Kuyruktaki kampanyaları iptal edebilirsiniz. Gönderilmeye başlanmış kampanyalar çift SMS riskini önlemek için otomatik tekrar gönderilmez.
        </div>
        <Table>
          <THead><Tr><Th>Tarih</Th><Th>Mesaj</Th><Th>Alıcı</Th><Th>Atlanan</Th><Th>Başarılı</Th><Th>Hatalı</Th><Th>Durum</Th><Th></Th></Tr></THead>
          <TBody>
            {campaigns.map((campaign) => (
              <Tr key={campaign.id}>
                <Td className="text-sm text-gray-500">{new Date(campaign.created_at).toLocaleString("tr-TR")}</Td>
                <Td className="max-w-sm truncate" title={campaign.message}>{campaign.message}</Td>
                <Td>{campaign.total_recipients}</Td>
                <Td className="text-amber-700">{campaign.skipped_recipients}</Td>
                <Td className="text-green-700">{campaign.success_count}</Td>
                <Td className="text-red-700">{campaign.fail_count}</Td>
                <Td><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses[campaign.status]}`}>{statusLabels[campaign.status]}</span></Td>
                <Td>{campaign.status === "queued" && <Button variant="danger" size="sm" onClick={() => handleCancel(campaign.id)}>İptal Et</Button>}</Td>
              </Tr>
            ))}
            {campaigns.length === 0 && <Tr><Td colSpan={8} className="text-center text-gray-500">Henüz kampanya bulunmuyor.</Td></Tr>}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
