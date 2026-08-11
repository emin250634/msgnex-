"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
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
import { createClient } from "@/lib/supabase/client"
import type { Contact, Group, SmsMessage } from "@/types"

type SegmentFilter = "all" | "vip" | "email" | "unassigned" | "active" | "consented" | "birthday" | string

const BIRTHDAY_LOOKAHEAD_DAYS = 30

function fullName(contact: Contact) {
  return `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("tr-TR")
}

function daysUntilNextBirthday(value?: string | null) {
  if (!value) return null

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let nextBirthday = new Date(today.getFullYear(), month - 1, day)

  if (Number.isNaN(nextBirthday.getTime())) return null
  if (nextBirthday < startOfToday) {
    nextBirthday = new Date(today.getFullYear() + 1, month - 1, day)
  }

  return Math.ceil((nextBirthday.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))
}

function hasUpcomingBirthday(contact: Contact) {
  const days = daysUntilNextBirthday(contact.birth_date)
  return days !== null && days <= BIRTHDAY_LOOKAHEAD_DAYS
}

export default function SegmentsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<SegmentFilter>("all")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      const supabase = createClient()
      const { data: profile, error: profileError } = await supabase.from("profiles").select("company_id").maybeSingle()

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }
      if (!profile?.company_id) {
        setLoading(false)
        return
      }

      const [{ data: contactRows, error: contactError }, { data: groupRows, error: groupError }, { data: messageRows, error: messageError }] = await Promise.all([
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
        supabase
          .from("sms_messages")
          .select("*")
          .eq("company_id", profile.company_id)
          .order("created_at", { ascending: false })
          .limit(500),
      ])

      if (contactError || groupError || messageError) {
        setError(contactError?.message || groupError?.message || messageError?.message || "Segment verileri yüklenemedi.")
      }

      setContacts(contactRows ?? [])
      setGroups(groupRows ?? [])
      setMessages(messageRows ?? [])
      setLoading(false)
    }

    load()
  }, [])

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const activePhones = useMemo(() => new Set(messages.map((message) => message.recipient)), [messages])

  const vipGroupIds = useMemo(() => new Set(
    groups.filter((group) => group.name.toLowerCase().includes("vip")).map((group) => group.id)
  ), [groups])

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase()

    return contacts.filter((contact) => {
      const group = contact.group_id ? groupMap.get(contact.group_id) ?? null : null
      const text = [fullName(contact), contact.phone, contact.email, group?.name].filter(Boolean).join(" ").toLowerCase()
      const matchesSearch = !q || text.includes(q)
      const matchesFilter =
        filter === "all" ||
        (filter === "vip" && Boolean(contact.group_id && vipGroupIds.has(contact.group_id))) ||
        (filter === "email" && Boolean(contact.email)) ||
        (filter === "unassigned" && !contact.group_id) ||
        (filter === "active" && activePhones.has(contact.phone)) ||
        (filter === "consented" && contact.consent_status === "opted_in") ||
        (filter === "birthday" && hasUpcomingBirthday(contact)) ||
        contact.group_id === filter

      return matchesSearch && matchesFilter
    })
  }, [activePhones, contacts, filter, groupMap, search, vipGroupIds])

  const segmentRows = groups.map((group) => {
    const members = contacts.filter((contact) => contact.group_id === group.id)
    return {
      group,
      total: members.length,
      email: members.filter((contact) => contact.email).length,
      active: members.filter((contact) => activePhones.has(contact.phone)).length,
    }
  })

  const vipCount = contacts.filter((contact) => Boolean(contact.group_id && vipGroupIds.has(contact.group_id))).length
  const emailCount = contacts.filter((contact) => Boolean(contact.email)).length
  const unassignedCount = contacts.filter((contact) => !contact.group_id).length
  const activeCount = contacts.filter((contact) => activePhones.has(contact.phone)).length
  const consentedCount = contacts.filter((contact) => contact.consent_status === "opted_in").length
  const upcomingBirthdayCount = contacts.filter(hasUpcomingBirthday).length

  const ruleCards = [
    {
      id: "consented" as SegmentFilter,
      title: "İzinli Kişiler",
      description: "Ticari ileti izni olan kişiler.",
      value: consentedCount,
      tone: "success" as const,
    },
    {
      id: "birthday" as SegmentFilter,
      title: "Doğum Günü Yaklaşanlar",
      description: `Önümüzdeki ${BIRTHDAY_LOOKAHEAD_DAYS} gün içinde doğum günü olan kişiler.`,
      value: upcomingBirthdayCount,
      tone: "warning" as const,
    },
    {
      id: "unassigned" as SegmentFilter,
      title: "Segmentsiz Kişiler",
      description: "Henüz kalıcı segmente atanmamış kayıtlar.",
      value: unassignedCount,
      tone: "neutral" as const,
    },
    {
      id: "active" as SegmentFilter,
      title: "SMS Geçmişi Olanlar",
      description: "Daha önce SMS kaydı oluşmuş kişiler.",
      value: activeCount,
      tone: "info" as const,
    },
  ]

  const getRuleContacts = (ruleId: SegmentFilter) => contacts.filter((contact) => {
    if (ruleId === "consented") return contact.consent_status === "opted_in"
    if (ruleId === "birthday") return hasUpcomingBirthday(contact)
    if (ruleId === "unassigned") return !contact.group_id
    if (ruleId === "active") return activePhones.has(contact.phone)
    return false
  })

  const startSmsFromRule = (rule: (typeof ruleCards)[number]) => {
    const phones = getRuleContacts(rule.id).map((contact) => contact.phone).filter(Boolean)
    if (phones.length === 0) return

    sessionStorage.setItem("msgnex_segment_rule_recipients", JSON.stringify(phones))
    sessionStorage.setItem("msgnex_segment_rule_name", rule.title)
    window.location.href = "/sms?source=segment-rule"
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Segmentler" description="CRM kişi listenizi segment, etiket ve iletişim aktivitesine göre izleyin." />
        <LoadingState variant="cards" rows={4} />
        <LoadingState variant="list" rows={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Segmentler" description="CRM kişi listenizi segment, etiket ve iletişim aktivitesine göre izleyin." />
        <ErrorState description={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segmentler"
        description="CRM kişi listenizi segment, etiket ve iletişim aktivitesine göre izleyin."
        actions={<Link href="/groups"><Button>Segmentleri Yönet</Button></Link>}
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Kayıtlı Segment" value={groups.length} description="Mevcut grup/segment sayısı" tone="blue" />
        <StatCard title="VIP Müşteri" value={vipCount} description="VIP segment etiketi" tone="rose" />
        <StatCard title="E-postalı Kişi" value={emailCount} description="Çok kanallı iletişim potansiyeli" tone="emerald" />
        <StatCard title="Aktif Kişi" value={activeCount} description="SMS geçmişi bulunan kişi" tone="amber" />
      </div>

      <Card title="Dinamik Segment Kuralları">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ruleCards.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-blue-200 hover:bg-blue-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-950">{rule.title}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{rule.description}</p>
                </div>
                <StatusBadge label={rule.value.toString()} tone={rule.tone} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setFilter(rule.id)}>
                  Filtrele
                </Button>
                <Button size="sm" onClick={() => startSmsFromRule(rule)} disabled={rule.value === 0}>
                  SMS Hazırla
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card title="Segment Özeti">
          {segmentRows.length > 0 ? (
            <div className="space-y-3">
              {segmentRows.map(({ group, total, email, active }) => (
                <button
                  key={group.id}
                  className="grid w-full gap-3 rounded-xl border border-gray-200 p-4 text-left transition-all hover:border-blue-200 hover:bg-blue-50/40 sm:grid-cols-[1fr_auto_auto_auto]"
                  onClick={() => setFilter(group.id)}
                >
                  <div>
                    <p className="font-semibold text-gray-950">{group.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{group.description || "Açıklama eklenmemiş"}</p>
                  </div>
                  <Metric label="Kişi" value={total} />
                  <Metric label="E-posta" value={email} />
                  <Metric label="Aktif" value={active} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<span className="text-2xl">SG</span>}
              title="Segment yok"
              description="Segment oluşturmak için gruplar ekranını kullanabilirsiniz."
              action={<Link href="/groups"><Button>Segment Oluştur</Button></Link>}
            />
          )}
        </Card>

        <Card title="Segment Filtreleme">
          <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              placeholder="Kişi, telefon, e-posta veya segment ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="all">Tüm kişiler</option>
              <option value="vip">VIP müşteriler</option>
              <option value="email">E-postalı kişiler</option>
              <option value="consented">İzinli kişiler</option>
              <option value="birthday">Doğum günü yaklaşanlar</option>
              <option value="active">SMS geçmişi olanlar</option>
              <option value="unassigned">Segmentsiz kişiler</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>

          {filteredContacts.length > 0 ? (
            <Table>
              <THead>
                <Tr>
                  <Th>Kişi</Th>
                  <Th>Telefon</Th>
                  <Th>Segment</Th>
                  <Th>Durum</Th>
                  <Th></Th>
                </Tr>
              </THead>
              <TBody>
                {filteredContacts.slice(0, 25).map((contact) => {
                  const group = contact.group_id ? groupMap.get(contact.group_id) ?? null : null
                  const isVip = Boolean(contact.group_id && vipGroupIds.has(contact.group_id))
                  const isActive = activePhones.has(contact.phone)

                  return (
                    <Tr key={contact.id}>
                      <Td>
                        <p className="font-semibold text-gray-950">{fullName(contact)}</p>
                        <p className="text-xs text-gray-500">{contact.email || "E-posta yok"}</p>
                      </Td>
                      <Td>{contact.phone}</Td>
                      <Td>{group ? <StatusBadge label={group.name} tone={isVip ? "purple" : "info"} /> : <StatusBadge label="Segmentsiz" tone="neutral" />}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {isVip && <StatusBadge label="VIP" tone="purple" />}
                          {isActive && <StatusBadge label="Aktif" tone="success" />}
                          {contact.consent_status === "opted_in" && <StatusBadge label="İzinli" tone="success" />}
                          {hasUpcomingBirthday(contact) && <StatusBadge label="Doğum günü" tone="warning" />}
                          {contact.email && <StatusBadge label="E-posta" tone="info" />}
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Link href={`/contacts/${contact.id}`}><Button variant="secondary" size="sm">Detay</Button></Link>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              icon={<span className="text-2xl">Kİ</span>}
              title="Filtreye uygun kişi yok"
              description="Arama veya segment filtresini değiştirerek tekrar deneyin."
              action={<Button variant="secondary" onClick={() => { setSearch(""); setFilter("all") }}>Filtreleri Temizle</Button>}
            />
          )}
          {filteredContacts.length > 25 && (
            <p className="mt-4 text-sm text-gray-500">İlk 25 kişi gösteriliyor. Daha dar filtre kullanabilirsiniz.</p>
          )}
        </Card>
      </div>

      <Card title="CRM Hazırlık Notları">
        <div className="grid gap-3 text-sm text-gray-600 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Etiket yaklaşımı</p>
            <p className="mt-1">VIP, e-posta ve aktiflik etiketleri mevcut veriden otomatik hesaplanır.</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Segment kaynağı</p>
            <p className="mt-1">Yeni migration olmadan mevcut gruplar CRM segmenti olarak kullanılır.</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-950">Sonraki adım</p>
            <p className="mt-1">Dinamik kuralları kalıcı hedef kitle olarak kaydetmek için ileride veritabanı modeli eklenebilir.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-left sm:text-right">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-950">{value}</p>
    </div>
  )
}
