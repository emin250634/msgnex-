"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { Group } from "@/types"

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("groups").select("*").order("created_at", { ascending: false })
    setGroups(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const supabase = createClient()
    const { data: profile } = await supabase.from("profiles").select("company_id").single()
    await supabase.from("groups").insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      company_id: profile?.company_id,
    })
    setNewName("")
    setNewDesc("")
    load()
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from("groups").delete().eq("id", id)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gruplar</h1>

      <Card>
        <div className="flex gap-3">
          <Input
            placeholder="Grup adı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Açıklama (opsiyonel)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Button onClick={handleCreate}>Oluştur</Button>
        </div>
      </Card>

      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Grup Adı</Th>
              <Th>Açıklama</Th>
              <Th>Kişi Sayısı</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {groups.map((g) => (
              <Tr key={g.id}>
                <Td className="font-medium">{g.name}</Td>
                <Td>{g.description || "-"}</Td>
                <Td>-</Td>
                <Td>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(g.id)}>Sil</Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
