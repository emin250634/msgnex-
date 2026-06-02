"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import { CsvUpload } from "@/components/forms/csv-upload"
import toast from "react-hot-toast"
import type { Contact, Group } from "@/types"

const PAGE_SIZE = 15

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadMode, setUploadMode] = useState<"none" | "single" | "csv">("none")
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Contact>>({})
  const [page, setPage] = useState(1)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [groupId, setGroupId] = useState("")
  const [adding, setAdding] = useState(false)
  const [csvGroupId, setCsvGroupId] = useState("")

  const load = async () => {
    const supabase = createClient()
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("company_id").maybeSingle()
    if (profileErr) { console.error("Profil sorgu hatası:", profileErr); setLoading(false); return }
    if (!profile?.company_id) { console.warn("Profilde firma ID yok"); setLoading(false); return }

    const { data: contacts } = await supabase
      .from("contacts").select("*")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
    const { data: groups } = await supabase.from("groups").select("*")

    setContacts(contacts ?? [])
    setGroups(groups ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter((c) =>
      (c.first_name?.toLowerCase() || "").includes(q) ||
      (c.last_name?.toLowerCase() || "").includes(q) ||
      (c.phone || "").includes(q) ||
      (c.email?.toLowerCase() || "").includes(q)
    )
  }, [contacts, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => { setPage(1) }, [search])

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from("contacts").delete().eq("id", id)
    load()
  }

  const startEdit = (c: Contact) => {
    setEditingId(c.id)
    setEditValues({ first_name: c.first_name, last_name: c.last_name || "", phone: c.phone, email: c.email || "", group_id: c.group_id })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValues({})
  }

  const saveEdit = async (id: string) => {
    const supabase = createClient()
    const updates: any = {}
    if (editValues.first_name !== undefined) updates.first_name = editValues.first_name
    if (editValues.last_name !== undefined) updates.last_name = editValues.last_name || null
    if (editValues.phone !== undefined) updates.phone = editValues.phone
    if (editValues.email !== undefined) updates.email = editValues.email || null
    if (editValues.group_id !== undefined) updates.group_id = editValues.group_id || null

    await supabase.from("contacts").update(updates).eq("id", id)
    setEditingId(null)
    setEditValues({})
    load()
  }

  const handleAddContact = async () => {
    if (!firstName.trim() || !phone.trim()) {
      toast.error("Ad ve telefon zorunludur")
      return
    }
    setAdding(true)
    const supabase = createClient()
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("company_id").maybeSingle()
    if (profileErr) { toast.error("Profil alınamadı: " + profileErr.message); setAdding(false); return }
    if (!profile?.company_id) { toast.error("Firma bilgisi bulunamadı. Admin ile iletişime geçin."); setAdding(false); return }

    const { error } = await supabase.from("contacts").insert({
      company_id: profile.company_id,
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      group_id: groupId || null,
    })

    if (error) { toast.error("Kişi eklenemedi"); setAdding(false); return }

    toast.success("Kişi eklendi")
    setFirstName("")
    setLastName("")
    setPhone("")
    setEmail("")
    setGroupId("")
    setAdding(false)
    setUploadMode("none")
    load()
  }

  const handleCsvComplete = () => {
    setUploadMode("none")
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kişiler</h1>
        <div className="flex gap-2">
          <Button variant={uploadMode === "single" ? "primary" : "secondary"} onClick={() => setUploadMode(uploadMode === "single" ? "none" : "single")}>
            Elle Ekle
          </Button>
          <Button variant={uploadMode === "csv" ? "primary" : "secondary"} onClick={() => setUploadMode(uploadMode === "csv" ? "none" : "csv")}>
            CSV Yükle
          </Button>
        </div>
      </div>

      {uploadMode === "single" && (
        <Card title="Kişi Ekle">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Ad *" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ad" />
            <Input label="Soyad" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Soyad" />
            <Input label="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxxx" />
            <Input label="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grup</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Grup yok</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddContact} disabled={adding || !firstName.trim() || !phone.trim()}>
              {adding ? "Ekleniyor..." : "Kişi Ekle"}
            </Button>
          </div>
        </Card>
      )}

      {uploadMode === "csv" && (
        <Card>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">CSV Formatı:</p>
            <p className="text-blue-700">CSV dosyanız aşağıdaki sütun başlıklarını içermelidir:</p>
            <pre className="mt-2 rounded bg-blue-100 px-3 py-2 text-xs leading-relaxed">
              first_name,last_name,phone,email{'\n'}Ahmet,Yılmaz,05551234567,ahmet@mail.com{'\n'}Ayşe,Demir,05559876543,ayse@mail.com
            </pre>
            <p className="mt-2 text-blue-700">
              <strong>phone</strong> ve <strong>first_name</strong> zorunludur. Sütun isimleri: <code className="bg-blue-100 px-1 rounded">phone</code>, <code className="bg-blue-100 px-1 rounded">telefon</code>, <code className="bg-blue-100 px-1 rounded">gsm</code>, <code className="bg-blue-100 px-1 rounded">ad</code>, <code className="bg-blue-100 px-1 rounded">soyad</code> gibi varyasyonları da algılanır.
            </p>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">CSV&rsquo;deki kişileri gruba ata (opsiyonel)</label>
            <select value={csvGroupId} onChange={(e) => setCsvGroupId(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Grup yok</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <CsvUpload groupId={csvGroupId || undefined} onComplete={(imported, errors) => {
            if (errors.length > 0) toast.error(`${errors.length} hata oluştu`)
            toast.success(`${imported} kişi içe aktarıldı`)
            handleCsvComplete()
          }} />
        </Card>
      )}

      <Card title="Kişi Listesi">
        <div className="mb-4">
          <Input
            placeholder="İsim, telefon veya e-posta ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
            {paged.map((c) => (
              <Tr key={c.id}>
                {editingId === c.id ? (
                  <>
                    <Td><Input value={editValues.first_name || ""} onChange={(e) => setEditValues({ ...editValues, first_name: e.target.value })} /></Td>
                    <Td><Input value={editValues.last_name || ""} onChange={(e) => setEditValues({ ...editValues, last_name: e.target.value })} /></Td>
                    <Td><Input value={editValues.phone || ""} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} /></Td>
                    <Td><Input value={editValues.email || ""} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} /></Td>
                    <Td>
                      <select
                        value={editValues.group_id || ""}
                        onChange={(e) => setEditValues({ ...editValues, group_id: e.target.value || null })}
                        className="block w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="">Grup yok</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => saveEdit(c.id)}>Kaydet</Button>
                        <Button variant="danger" size="sm" onClick={cancelEdit}>İptal</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td className="font-medium">{c.first_name}</Td>
                    <Td>{c.last_name || "-"}</Td>
                    <Td>{c.phone}</Td>
                    <Td>{c.email || "-"}</Td>
                    <Td>{groups.find((g) => g.id === c.group_id)?.name || "-"}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => startEdit(c)}>Düzenle</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}>Sil</Button>
                      </div>
                    </Td>
                  </>
                )}
              </Tr>
            ))}
            {paged.length === 0 && (
              <Tr>
                <Td colSpan={6} className="text-center text-gray-500">
                  {search ? "Eşleşen kişi bulunamadı" : "Kişi bulunamadı"}
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              Toplam {filtered.length} kişi (sayfa {page}/{totalPages})
            </p>
            <div className="flex gap-1">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Geri</Button>
              <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>İleri</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
