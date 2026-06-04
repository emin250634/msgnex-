import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"

export default function AutomationsLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Otomasyonlar" description="Hoş geldin, kampanya ve müşteri hatırlatma akışlarını manuel onaylı şekilde yönetin." />
      <LoadingState variant="cards" rows={4} />
      <LoadingState variant="table" rows={5} />
    </div>
  )
}
