"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
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

  const load = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc("list_customer_api_keys")
    if (error) toast.error(error.message)
    setKeys(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    const rawKey = generateApiKey()
    const supabase = createClient()
    const { error } = await supabase.rpc("create_customer_api_key", {
      p_name: name.trim(),
      p_key_prefix: rawKey.slice(0, 16),
      p_key_hash: await sha256(rawKey),
    })

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    setName("")
    setCreatedKey(rawKey)
    toast.success("API anahtarı oluşturuldu")
    load()
  }

  const handleRevoke = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.rpc("revoke_customer_api_key", { p_key_id: id })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("API anahtarı iptal edildi")
    load()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdKey)
    toast.success("API anahtarı panoya kopyalandı")
  }

  if (loading) return <p>Yükleniyor...</p>

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
          <div className="mt-4 flex gap-2">
            <Input readOnly value={createdKey} />
            <Button onClick={handleCopy}>Kopyala</Button>
          </div>
        </Card>
      )}

      <Card title="Yeni Anahtar Oluştur">
        <div className="flex gap-3 items-end">
          <Input label="Anahtar Adı" placeholder="Örn: CRM entegrasyonu" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? "Oluşturuluyor..." : "Oluştur"}
          </Button>
        </div>
      </Card>

      <Card title="Mevcut Anahtarlar">
        <Table>
          <THead><Tr><Th>Ad</Th><Th>Anahtar Başlangıcı</Th><Th>Son Kullanım</Th><Th>Durum</Th><Th></Th></Tr></THead>
          <TBody>
            {keys.map((key) => (
              <Tr key={key.id}>
                <Td className="font-medium">{key.name}</Td>
                <Td className="font-mono text-sm">{key.key_prefix}...</Td>
                <Td className="text-sm text-gray-500">{key.last_used_at ? new Date(key.last_used_at).toLocaleString("tr-TR") : "-"}</Td>
                <Td>{key.is_active ? "Aktif" : "İptal"}</Td>
                <Td>{key.is_active && <Button variant="danger" size="sm" onClick={() => handleRevoke(key.id)}>İptal Et</Button>}</Td>
              </Tr>
            ))}
            {keys.length === 0 && <Tr><Td colSpan={5} className="text-center text-gray-500">Henüz API anahtarı oluşturulmadı.</Td></Tr>}
          </TBody>
        </Table>
      </Card>

      <Card title="Örnek API İsteği">
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
{`curl -X POST http://localhost:3000/api/v1/external/messages \\
  -H "Authorization: Bearer API_ANAHTARINIZ" \\
  -H "Idempotency-Key: crm-order-12345" \\
  -H "Content-Type: application/json" \\
  -d '{"recipients":["905551112233"],"message":"Siparişiniz hazır."}'`}
        </pre>
      </Card>
    </div>
  )
}
