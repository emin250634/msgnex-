import { Button } from "@/components/ui/button"

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = "Veri yüklenemedi",
  description = "Bağlantı veya yetki kaynaklı geçici bir sorun oluşmuş olabilir.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700">
        !
      </div>
      <h3 className="mt-3 text-sm font-semibold text-red-950">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-red-700">{description}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>Yeniden Dene</Button>
        </div>
      )}
    </div>
  )
}
