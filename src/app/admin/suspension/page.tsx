"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { Company } from "@/types"

export default function SuspensionPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("companies").select("*").order("name")
    setCompanies(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleStatus = async (id: string, current: boolean) => {
    const supabase = createClient()
    await supabase.from("companies").update({ is_active: !current }).eq("id", id)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Hesap Askıya Alma</h1>

      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>Telefon</Th>
              <Th>Durum</Th>
              <Th>İşlem</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.phone || "-"}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    c.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {c.is_active ? "Aktif" : "Askıda"}
                  </span>
                </Td>
                <Td>
                  <Button
                    variant={c.is_active ? "danger" : "primary"}
                    size="sm"
                    onClick={() => toggleStatus(c.id, c.is_active)}
                  >
                    {c.is_active ? "Askıya Al" : "Aktifleştir"}
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
