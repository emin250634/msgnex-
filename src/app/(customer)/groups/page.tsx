"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { Group } from "@/types"

export default function GroupsPage() {
  const [groups, setGroups] = useState<(Group & { contact_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [search, setSearch] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle()
    if (!profile?.company_id) { setLoading(false); return }

    const { data: gData } = await supabase.from("groups").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false })
    const groupsList = gData ?? []

    const { data: contacts } = await supabase.from("contacts").select("group_id").eq("company_id", profile.company_id)
    const countMap: Record<string, number> = {}
    contacts?.forEach((c: any) => {
      if (c.group_id) countMap[c.group_id] = (countMap[c.group_id] || 0) + 1
    })

    setGroups(groupsList.map((g) => ({ ...g, contact_count: countMap[g.id] || 0 })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const supabase = createClient()
    const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle()
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

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter((g) => g.name.toLowerCase().includes(q) || (g.description?.toLowerCase() || "").includes(q))
  }, [groups, search])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gruplar</h1>

      <Card title="Yeni Grup">
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

      <Card title="Gruplar">
        <div className="mb-4">
          <Input
            placeholder="Grup ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
            {filtered.map((g) => (
              <Tr key={g.id}>
                <Td className="font-medium">{g.name}</Td>
                <Td>{g.description || "-"}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {g.contact_count}
                  </span>
                </Td>
                <Td>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(g.id)}>Sil</Button>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={4} className="text-center text-gray-500">
                  {search ? "Eşleşen grup bulunamadı" : "Grup bulunamadı"}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
