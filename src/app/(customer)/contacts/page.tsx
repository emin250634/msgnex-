"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { ContactProfileDrawer } from "@/components/crm/contact-profile-drawer"
import { CsvUpload } from "@/components/forms/csv-upload"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table"
import { PLAN_LABELS, type CompanyPlan } from "@/lib/plans"
import { createClient } from "@/lib/supabase/client"
import { recordContactConsentEvent } from "@/services/contacts"
import type { Contact, Group } from "@/types"

const PAGE_SIZE = 15

type TagFilter = "all" | "vip" | "email" | "new" | "unassigned"
type ConsentStatus = Contact["consent_status"]

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("tr-TR")
}

function fullName(contact: Contact) {
  return `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
}

function consentLabel(value?: ConsentStatus | null) {
  if (value === "opted_in") return "İzinli"
  if (value === "opted_out") return "İzinsiz"
  return "Bilinmiyor"
}

function consentTone(value?: ConsentStatus | null) {
  if (value === "opted_in") return "success" as const
  if (value === "opted_out") return "danger" as const
  return "warning" as const
}

function isRecentContact(contact: Contact) {
  const createdAt = new Date(contact.created_at).getTime()
  if (Number.isNaN(createdAt)) return false
  return Date.now() - createdAt <= 1000 * 60 * 60 * 24 * 30
}

function deriveContactTags(contact: Contact, group?: Group | null) {
  const tags: string[] = []
  const groupName = group?.name?.trim()

  if (groupName) tags.push(groupName)
  if (groupName?.toLowerCase().includes("vip")) tags.push("VIP")
  if (contact.email) tags.push("E-posta var")
  tags.push(consentLabel(contact.consent_status))
  if (isRecentContact(contact)) tags.push("Yeni kayıt")
  if (!groupName) tags.push("Segmentsiz")

  return Array.from(new Set(tags))
}

function hasTag(contact: Contact, group: Group | null, filter: TagFilter) {
  if (filter === "all") return true
  if (filter === "vip") return Boolean(group?.name?.toLowerCase().includes("vip"))
  if (filter === "email") return Boolean(contact.email)
  if (filter === "new") return isRecentContact(contact)
  if (filter === "unassigned") return !contact.group_id
  return true
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [uploadMode, setUploadMode] = useState<"none" | "single" | "csv">("none")
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState<TagFilter>("all")
  const [consentFilter, setConsentFilter] = useState<"all" | ConsentStatus>("all")
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Contact>>({})
  const [page, setPage] = useState(1)

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [groupId, setGroupId] = useState("")
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>("unknown")
  const [adding, setAdding] = useState(false)
  const [csvGroupId, setCsvGroupId] = useState("")
  const [csvConsentStatus, setCsvConsentStatus] = useState<ConsentStatus>("unknown")
  const [planUsage, setPlanUsage] = useState<{
    plan: CompanyPlan
    contact_limit: number
    current_contacts: number
  } | null>(null)

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("company_id").maybeSingle()

    if (profileErr) {
      console.error("Profil sorgu hatası:", profileErr)
      setError(profileErr.message)
      setLoading(false)
      return
    }

    if (!profile?.company_id) {
      console.warn("Profilde firma ID yok")
      setLoading(false)
      return
    }

    const [{ data: contactRows, error: contactError }, { data: groupRows, error: groupError }, { data: limitRows }] = await Promise.all([
      supabase
        .from("contacts")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("groups")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name", { ascending: true }),
      supabase.rpc("get_customer_plan_limits"),
    ])

    if (contactError || groupError) {
      setError(contactError?.message || groupError?.message || "Kişi verileri yüklenemedi.")
    }

    setContacts(contactRows ?? [])
    setGroups(groupRows ?? [])
    setPlanUsage(limitRows?.[0] ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return contacts.filter((contact) => {
      const group = contact.group_id ? groupMap.get(contact.group_id) ?? null : null
      const searchable = [
        contact.first_name,
        contact.last_name,
        contact.phone,
        contact.email,
        group?.name,
      ].filter(Boolean).join(" ").toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesGroup =
        groupFilter === "all" ||
        (groupFilter === "unassigned" ? !contact.group_id : contact.group_id === groupFilter)
      const matchesConsent = consentFilter === "all" || contact.consent_status === consentFilter

      return matchesSearch && matchesGroup && matchesConsent && hasTag(contact, group, tagFilter)
    })
  }, [consentFilter, contacts, groupFilter, groupMap, search, tagFilter])

  const unassignedCount = contacts.filter((contact) => !contact.group_id).length
  const consentedCount = contacts.filter((contact) => contact.consent_status === "opted_in").length
  const optedOutCount = contacts.filter((contact) => contact.consent_status === "opted_out").length
  const contactLimit = planUsage?.contact_limit ?? null
  const currentContactCount = planUsage?.current_contacts ?? contacts.length
  const remainingContactLimit = contactLimit === null ? undefined : Math.max(0, contactLimit - currentContactCount)
  const contactLimitReached = typeof remainingContactLimit === "number" && remainingContactLimit <= 0
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => {
    setPage(1)
  }, [search, groupFilter, tagFilter, consentFilter])

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from("contacts").delete().eq("id", id)
    if (selectedContact?.id === id) setSelectedContact(null)
    load()
  }

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id)
    setEditValues({
      first_name: contact.first_name,
      last_name: contact.last_name || "",
      phone: contact.phone,
      email: contact.email || "",
      group_id: contact.group_id,
      consent_status: contact.consent_status || "unknown",
      consent_source: contact.consent_source || "",
      consent_note: contact.consent_note || "",
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValues({})
  }

  const saveEdit = async (id: string) => {
    const supabase = createClient()
    const currentContact = contacts.find((contact) => contact.id === id)
    const updates: Partial<Contact> = {}
    if (editValues.first_name !== undefined) updates.first_name = editValues.first_name
    if (editValues.last_name !== undefined) updates.last_name = editValues.last_name || null
    if (editValues.phone !== undefined) updates.phone = editValues.phone
    if (editValues.email !== undefined) updates.email = editValues.email || null
    if (editValues.group_id !== undefined) updates.group_id = editValues.group_id || null
    if (editValues.consent_status !== undefined) {
      updates.consent_status = editValues.consent_status
      updates.consent_source = editValues.consent_status !== "unknown" ? editValues.consent_source || "manual" : null
      updates.consent_recorded_at = editValues.consent_status !== "unknown" ? new Date().toISOString() : null
      updates.consent_note = editValues.consent_note || null
    }

    await supabase.from("contacts").update(updates).eq("id", id)

    if (
      currentContact &&
      editValues.consent_status !== undefined &&
      editValues.consent_status !== currentContact.consent_status
    ) {
      await recordContactConsentEvent({
        companyId: currentContact.company_id,
        contactId: currentContact.id,
        phone: currentContact.phone,
        previousStatus: currentContact.consent_status,
        nextStatus: editValues.consent_status,
        source: editValues.consent_status !== "unknown" ? editValues.consent_source || "manual" : "manual",
        note: editValues.consent_note || null,
      })
    }

    setEditingId(null)
    setEditValues({})
    load()
  }

  const handleAddContact = async () => {
    if (!firstName.trim() || !phone.trim()) {
      toast.error("Ad ve telefon zorunludur")
      return
    }
    if (contactLimitReached) {
      toast.error("Mevcut plan kişi limitine ulaştı.")
      return
    }

    setAdding(true)
    const supabase = createClient()
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("company_id").maybeSingle()

    if (profileErr) {
      toast.error("Profil alınamadı: " + profileErr.message)
      setAdding(false)
      return
    }

    if (!profile?.company_id) {
      toast.error("Firma bilgisi bulunamadı. Admin ile iletişime geçin.")
      setAdding(false)
      return
    }

    const { data: insertedContact, error } = await supabase.from("contacts").insert({
      company_id: profile.company_id,
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      group_id: groupId || null,
      consent_status: consentStatus,
      consent_source: consentStatus !== "unknown" ? "manual" : null,
      consent_recorded_at: consentStatus !== "unknown" ? new Date().toISOString() : null,
    }).select("id, company_id, phone").single()

    if (error) {
      toast.error("Kişi eklenemedi")
      setAdding(false)
      return
    }

    if (consentStatus !== "unknown" && insertedContact) {
      await recordContactConsentEvent({
        companyId: insertedContact.company_id,
        contactId: insertedContact.id,
        phone: insertedContact.phone,
        nextStatus: consentStatus,
        source: "manual",
      })
    }

    toast.success("Kişi eklendi")
    setFirstName("")
    setLastName("")
    setPhone("")
    setEmail("")
    setGroupId("")
    setConsentStatus("unknown")
    setAdding(false)
    setUploadMode("none")
    load()
  }

  const handleCsvComplete = () => {
    setUploadMode("none")
    load()
  }

  const selectedGroup = selectedContact?.group_id ? groupMap.get(selectedContact.group_id) ?? null : null
  const selectedTags = selectedContact ? deriveContactTags(selectedContact, selectedGroup) : []

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kişiler" description="Müşteri kayıtlarını, segmentlerini ve iletişim geçmişini tek CRM görünümünde yönetin." />
        <LoadingState variant="cards" rows={4} />
        <LoadingState variant="table" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kişiler" description="Müşteri kayıtlarını, segmentlerini ve iletişim geçmişini tek CRM görünümünde yönetin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kişiler"
        description="Müşteri kayıtlarını, segmentlerini ve iletişim geçmişini tek CRM görünümünde yönetin."
        actions={
          <>
            <Button variant={uploadMode === "single" ? "primary" : "secondary"} disabled={contactLimitReached} onClick={() => setUploadMode(uploadMode === "single" ? "none" : "single")}>
              Kişi Ekle
            </Button>
            <Button variant={uploadMode === "csv" ? "primary" : "secondary"} disabled={contactLimitReached} onClick={() => setUploadMode(uploadMode === "csv" ? "none" : "csv")}>
              CSV Yükle
            </Button>
          </>
        }
      />

      {contactLimitReached && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Mevcut plan kişi limitine ulaştı. Daha fazla kişi eklemek için Planım ekranından yükseltme talebi gönderebilirsiniz.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Toplam Kişi" value={contacts.length} description={planUsage ? `${PLAN_LABELS[planUsage.plan]} limiti: ${planUsage.contact_limit.toLocaleString("tr-TR")}` : "CRM kayıt sayısı"} tone="blue" />
        <StatCard title="İzinli Kişi" value={consentedCount} description="Ticari ileti onayı var" tone="emerald" />
        <StatCard title="İzinsiz Kişi" value={optedOutCount} description="SMS gönderiminden çıkarılır" tone="rose" />
        <StatCard title="Segmentsiz" value={unassignedCount} description="Sınıflandırma bekleyen kayıt" tone="amber" />
      </div>

      {uploadMode === "single" && (
        <Card title="Kişi Ekle">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Ad *" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ad" />
            <Input label="Soyad" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Soyad" />
            <Input label="Telefon *" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxxx" />
            <Input label="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Segment</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Segment yok</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ticari ileti izni</label>
              <select value={consentStatus} onChange={(e) => setConsentStatus(e.target.value as ConsentStatus)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="unknown">Bilinmiyor</option>
                <option value="opted_in">İzinli</option>
                <option value="opted_out">İzinsiz</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleAddContact} disabled={adding || !firstName.trim() || !phone.trim() || contactLimitReached}>
              {adding ? "Ekleniyor..." : "Kişi Ekle"}
            </Button>
          </div>
        </Card>
      )}

      {uploadMode === "csv" && (
        <Card>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="mb-1 font-medium">CSV formatı:</p>
            <p className="text-blue-700">CSV dosyanız şu sütunları içermelidir:</p>
            <pre className="mt-2 rounded bg-blue-100 px-3 py-2 text-xs leading-relaxed">
              first_name,last_name,phone,email{"\n"}Ahmet,Yılmaz,05551234567,ahmet@mail.com{"\n"}Ayşe,Demir,05559876543,ayse@mail.com
            </pre>
            <p className="mt-2 text-blue-700">
              <strong>phone</strong> ve <strong>first_name</strong> zorunludur. Telefon, gsm, ad, soyad gibi varyasyonlar da algılanır.
            </p>
            <p className="mt-2 text-blue-700">
              Dosya önce analiz edilir; hatalı ve tekrar eden satırlar gösterilir. Kayıtlar yalnızca son onaydan sonra içe aktarılır.
            </p>
            <p className="mt-2 text-blue-700">
              Kolonlar otomatik tahmin edilir; gerekirse telefon, ad, soyad, e-posta ve izin kolonlarını elle eşleştirebilirsiniz.
            </p>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">CSV içindeki kişileri segmente ata</label>
            <select value={csvGroupId} onChange={(e) => setCsvGroupId(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Segment yok</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">CSV varsayılan ticari ileti izni</label>
            <select value={csvConsentStatus} onChange={(e) => setCsvConsentStatus(e.target.value as ConsentStatus)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="unknown">Bilinmiyor</option>
              <option value="opted_in">İzinli</option>
              <option value="opted_out">İzinsiz</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">CSV içinde izin/onay kolonu varsa satırdaki değer önceliklidir.</p>
          </div>
          <CsvUpload groupId={csvGroupId || undefined} defaultConsentStatus={csvConsentStatus} remainingLimit={remainingContactLimit} onComplete={(imported, errors) => {
            if (errors.length > 0) toast.error(`${errors.length} hata oluştu`)
            toast.success(`${imported} kişi içe aktarıldı`)
            handleCsvComplete()
          }} />
        </Card>
      )}

      <Card title="CRM Kişi Listesi">
        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_190px_190px]">
          <Input
            placeholder="İsim, telefon, e-posta veya segment ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">Tüm segmentler</option>
            <option value="unassigned">Segmentsiz</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value as TagFilter)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">Tüm etiketler</option>
            <option value="vip">VIP</option>
            <option value="email">E-postalı</option>
            <option value="new">Yeni kayıt</option>
            <option value="unassigned">Segmentsiz</option>
          </select>
          <select value={consentFilter} onChange={(e) => setConsentFilter(e.target.value as "all" | ConsentStatus)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">Tüm izin durumları</option>
            <option value="opted_in">İzinli</option>
            <option value="opted_out">İzinsiz</option>
            <option value="unknown">Bilinmiyor</option>
          </select>
        </div>

        {paged.length > 0 ? (
          <>
            <Table>
              <THead>
                <Tr>
                  <Th>Kişi</Th>
                  <Th>Telefon</Th>
                  <Th>E-posta</Th>
                  <Th>Segment</Th>
                  <Th>İzin</Th>
                  <Th>Etiketler</Th>
                  <Th>Kayıt</Th>
                  <Th></Th>
                </Tr>
              </THead>
              <TBody>
                {paged.map((contact) => {
                  const group = contact.group_id ? groupMap.get(contact.group_id) ?? null : null
                  const tags = deriveContactTags(contact, group)

                  return (
                    <Tr key={contact.id}>
                      {editingId === contact.id ? (
                        <>
                          <Td><Input value={editValues.first_name || ""} onChange={(e) => setEditValues({ ...editValues, first_name: e.target.value })} /></Td>
                          <Td><Input value={editValues.phone || ""} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} /></Td>
                          <Td><Input value={editValues.email || ""} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} /></Td>
                          <Td>
                            <select
                              value={editValues.group_id || ""}
                              onChange={(e) => setEditValues({ ...editValues, group_id: e.target.value || null })}
                              className="block w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="">Segment yok</option>
                              {groups.map((groupItem) => (
                                <option key={groupItem.id} value={groupItem.id}>{groupItem.name}</option>
                              ))}
                            </select>
                          </Td>
                          <Td>
                            <select
                              value={editValues.consent_status || "unknown"}
                              onChange={(e) => setEditValues({ ...editValues, consent_status: e.target.value as ConsentStatus })}
                              className="block w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="unknown">Bilinmiyor</option>
                              <option value="opted_in">İzinli</option>
                              <option value="opted_out">İzinsiz</option>
                            </select>
                          </Td>
                          <Td><Input value={editValues.last_name || ""} onChange={(e) => setEditValues({ ...editValues, last_name: e.target.value })} /></Td>
                          <Td>{formatDate(contact.created_at)}</Td>
                          <Td>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" onClick={() => saveEdit(contact.id)}>Kaydet</Button>
                              <Button variant="secondary" size="sm" onClick={cancelEdit}>İptal</Button>
                            </div>
                          </Td>
                        </>
                      ) : (
                        <>
                          <Td>
                            <button className="text-left" onClick={() => setSelectedContact(contact)}>
                              <span className="block font-semibold text-gray-950">{fullName(contact)}</span>
                              <span className="text-xs text-gray-500">CRM profili aç</span>
                            </button>
                          </Td>
                          <Td className="font-medium text-gray-700">{contact.phone}</Td>
                          <Td>{contact.email || "-"}</Td>
                          <Td>{group ? <StatusBadge label={group.name} tone={group.name.toLowerCase().includes("vip") ? "purple" : "info"} /> : <StatusBadge label="Segmentsiz" tone="neutral" />}</Td>
                          <Td><StatusBadge label={consentLabel(contact.consent_status)} tone={consentTone(contact.consent_status)} /></Td>
                          <Td>
                            <div className="flex max-w-xs flex-wrap gap-1.5">
                              {tags.slice(0, 3).map((tag) => (
                                <StatusBadge key={tag} label={tag} tone={tag.toLowerCase().includes("vip") ? "purple" : "neutral"} />
                              ))}
                            </div>
                          </Td>
                          <Td>{formatDate(contact.created_at)}</Td>
                          <Td>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="secondary" size="sm" onClick={() => setSelectedContact(contact)}>Profil</Button>
                              <Link href={`/contacts/${contact.id}`}><Button variant="secondary" size="sm">Detay</Button></Link>
                              <Button size="sm" onClick={() => startEdit(contact)}>Düzenle</Button>
                              <Button variant="danger" size="sm" onClick={() => handleDelete(contact.id)}>Sil</Button>
                            </div>
                          </Td>
                        </>
                      )}
                    </Tr>
                  )
                })}
              </TBody>
            </Table>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-500">
                  Toplam {filtered.length} kişi (sayfa {page}/{totalPages})
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Geri</Button>
                  <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>İleri</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<span className="text-2xl">Kİ</span>}
            title={search || groupFilter !== "all" || tagFilter !== "all" || consentFilter !== "all" ? "Filtreye uygun kişi bulunamadı" : "Kişi bulunamadı"}
            description="Kişi ekleyerek veya CSV yükleyerek CRM listenizi oluşturmaya başlayın."
            action={<Button variant="secondary" onClick={search || groupFilter !== "all" || tagFilter !== "all" || consentFilter !== "all" ? () => { setSearch(""); setGroupFilter("all"); setTagFilter("all"); setConsentFilter("all") } : () => setUploadMode("single")}>{search || groupFilter !== "all" || tagFilter !== "all" || consentFilter !== "all" ? "Filtreleri Temizle" : "Kişi Ekle"}</Button>}
          />
        )}
      </Card>

      <ContactProfileDrawer
        contact={selectedContact}
        group={selectedGroup}
        tags={selectedTags}
        onClose={() => setSelectedContact(null)}
      />
    </div>
  )
}
