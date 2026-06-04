import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"

export default function DashboardLoading() {
  return (
    <div className="space-y-7">
      <PageHeader title="Dashboard" description="SMS operasyon özeti ve hızlı erişimler yükleniyor." />
      <LoadingState variant="cards" rows={4} />
      <LoadingState variant="cards" rows={3} className="xl:grid-cols-3" />
      <LoadingState variant="table" rows={5} />
    </div>
  )
}
