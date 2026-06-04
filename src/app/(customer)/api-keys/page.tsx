"use client"

import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import type { CustomerApiKey } from "@/types"

function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `mnx_${token}`
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<CustomerApiKey[]>([])
  const [name, setName] = useState("")
  const [createdKey, setCreatedKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error: loadError } = await supabase.rpc("list_customer_api_keys")
    if (loadError) {
      setError(loadError.message)
      toast.error(loadError.message)
    }
    setKeys(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    const rawKey = generateApiKey()
    const supabase = createClient()
    const { error: createError } = await supabase.rpc("create_customer_api_key", {
      p_name: name.trim(),
      p_key_prefix: rawKey.slice(0, 16),
      p_key_hash: await sha256(rawKey),
    })

    setSaving(false)
    if (createError) {
      toast.error(createError.message)
      return
    }

    setName("")
    setCreatedKey(rawKey)
    toast.success("API anahtarı oluşturuldu")
    load()
  }

  const handleRevoke = async (id: string) => {
    const supabase = createClient()
    const { error: revokeError } = await supabase.rpc("revoke_customer_api_key", { p_key_id: id })
    if (revokeError) {
      toast.error(revokeError.message)
      return
    }
    toast.success("API anahtarı iptal edildi")
    load()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdKey)
    toast.success("API anahtarı panoya kopyalandı")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Anahtarları" description="Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun." />
        <LoadingState variant="table" rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Anahtarları" description="Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Anahtarları"
        description="Kendi yazılımınızdan işlemsel SMS göndermek için güvenli API anahtarları oluşturun."
      />

      {createdKey && (
        <Card title="Yeni API Anahtarınız">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Bu anahtar yalnızca bir kez gösterilir. Güvenli bir yerde saklayın.
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={createdKey} />
            <Button onClick={handleCopy}>Kopyala</Button>
          </div>
        </Card>
      )}

      <Card title="Yeni Anahtar Oluştur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input label="Anahtar Adı" placeholder="Örn: CRM entegrasyonu" value={name} onChange={(event) => setName(event.target.value)} />
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? "Oluşturuluyor..." : "Oluştur"}
          </Button>
        </div>
      </Card>

      <Card title="Mevcut Anahtarlar">
        {keys.length > 0 ? (
          <Table>
            <THead><Tr><Th>Ad</Th><Th>Anahtar Başlangıcı</Th><Th>Son Kullanım</Th><Th>Durum</Th><Th></Th></Tr></THead>
            <TBody>
              {keys.map((key) => (
                <Tr key={key.id}>
                  <Td className="font-medium">{key.name}</Td>
                  <Td className="font-mono text-sm">{key.key_prefix}...</Td>
                  <Td className="text-sm text-gray-500">{key.last_used_at ? new Date(key.last_used_at).toLocaleString("tr-TR") : "-"}</Td>
                  <Td><StatusBadge label={key.is_active ? "Aktif" : "İptal"} tone={key.is_active ? "success" : "neutral"} /></Td>
                  <Td>{key.is_active && <Button variant="danger" size="sm" onClick={() => handleRevoke(key.id)}>İptal Et</Button>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">API</span>}
            title="Henüz API anahtarı yok"
            description="Entegrasyonlarınız için güvenli bir API anahtarı oluşturun."
            action={<Button variant="secondary" onClick={() => document.querySelector<HTMLInputElement>("input")?.focus()}>Anahtar Adı Gir</Button>}
          />
        )}
      </Card>

      <Card title="Örnek API İsteği">
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
{`curl -X POST https://app.msgnex.com/api/v1/external/messages \\
  -H "Authorization: Bearer API_ANAHTARINIZ" \\
  -H "Idempotency-Key: crm-order-12345" \\
  -H "Content-Type: application/json" \\
  -d '{"recipients":["905551112233"],"message":"Siparişiniz hazır."}'`}
        </pre>
      </Card>
    </div>
  )
}
