"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { CsvUpload } from "@/components/forms/csv-upload"
import type { Contact, Group } from "@/types"

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  const load = async () => {
    const supabase = createClient()
    const { data: contacts } = await supabase.from("contacts").select("*").order("created_at", { ascending: false })
    const { data: groups } = await supabase.from("groups").select("*")
    setContacts(contacts ?? [])
    setGroups(groups ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from("contacts").delete().eq("id", id)
    load()
  }

  const handleCsvComplete = () => {
    setShowUpload(false)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kişiler</h1>
        <Button onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? "Kapat" : "CSV Yükle"}
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CsvUpload onComplete={(imported, errors) => {
            if (errors.length > 0) alert(`${imported} kişi içe aktarıldı, ${errors.length} hata`)
            handleCsvComplete()
          }} />
        </Card>
      )}

      <Card>
        <Table>
          <THead>
            <Tr>
              <Th>Ad</Th>
              <Th>Soyad</Th>
              <Th>Telefon</Th>
              <Th>E-posta</Th>
              <Th>Grup</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {contacts.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.first_name}</Td>
                <Td>{c.last_name}</Td>
                <Td>{c.phone}</Td>
                <Td>{c.email}</Td>
                <Td>{groups.find((g) => g.id === c.group_id)?.name || "-"}</Td>
                <Td>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}>
                    Sil
                  </Button>
                </Td>
              </Tr>
            ))}
            {contacts.length === 0 && (
              <Tr>
                <Td colSpan={6} className="text-center text-gray-500">Kişi bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
