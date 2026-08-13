"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { getProviderErrorInfo } from "@/lib/provider-errors"
import { createClient } from "@/lib/supabase/client"
import type { Group, SmsCampaign, SmsMessage } from "@/types"
import {
  type CampaignStatusFilter,
  type DlrFilter,
  matchesDateRange,
  matchesDlr,
  monthStartInputValue,
  percent,
  toDateInputValue,
} from "./campaign-utils"
import {
  getPhoneFormatIssue,
  isSuppressionCandidate,
  normalizePhoneForCompare,
  type PhoneFormatIssue,
} from "./campaign-phone"
import {
  buildCampaignReportCsv,
  buildCampaignReportHtml,
  buildFailedRecipientsCsv,
  campaignReportFileName,
  downloadTextFile,
  fileSafeDate,
} from "./campaign-reports"
import { CampaignFilters } from "./campaign-filters"
import { CampaignList } from "./campaign-list"
import { CampaignDetailModal } from "./campaign-detail-modal"
import { CampaignCancelModal, FailedRecipientsSegmentModal } from "./campaign-modals"

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelTarget, setCancelTarget] = useState<SmsCampaign | null>(null)
  const [detailTarget, setDetailTarget] = useState<SmsCampaign | null>(null)
  const [detailMessages, setDetailMessages] = useState<SmsMessage[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [dlrFilter, setDlrFilter] = useState<DlrFilter>("all")
  const [groupFilter, setGroupFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [segmentModalOpen, setSegmentModalOpen] = useState(false)
  const [segmentGroupId, setSegmentGroupId] = useState("")
  const [newSegmentName, setNewSegmentName] = useState("")
  const [segmenting, setSegmenting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    const supabase = createClient()
    const [{ data: campaignRows, error: campaignError }, { data: groupRows, error: groupError }] = await Promise.all([
      supabase
        .from("sms_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("groups")
        .select("*")
        .order("name", { ascending: true }),
    ])
    if (campaignError || groupError) {
      setError(campaignError?.message || groupError?.message || "Kampanya verileri yüklenemedi.")
    }
    setCampaigns(campaignRows ?? [])
    setGroups(groupRows ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const providerOptions = useMemo(() => Array.from(new Set(campaigns.map((campaign) => campaign.provider_name).filter(Boolean))) as string[], [campaigns])

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()

    return campaigns.filter((campaign) => {
      const group = campaign.group_id ? groupMap.get(campaign.group_id) : null
      const searchable = [
        campaign.name,
        campaign.message,
        campaign.provider_name,
        campaign.provider_status,
        campaign.provider_status_text,
        group?.name,
      ].filter(Boolean).join(" ").toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter
      const matchesProvider = providerFilter === "all" || campaign.provider_name === providerFilter
      const matchesGroup = groupFilter === "all" || (groupFilter === "none" ? !campaign.group_id : campaign.group_id === groupFilter)

      return matchesSearch &&
        matchesStatus &&
        matchesProvider &&
        matchesGroup &&
        matchesDlr(campaign, dlrFilter) &&
        matchesDateRange(campaign.created_at, dateFrom, dateTo)
    })
  }, [campaigns, dateFrom, dateTo, dlrFilter, groupFilter, groupMap, providerFilter, search, statusFilter])

  const hasActiveFilters = Boolean(search || statusFilter !== "all" || providerFilter !== "all" || dlrFilter !== "all" || groupFilter !== "all" || dateFrom || dateTo)
  const filteredSummary = useMemo(() => {
    const totalRecipients = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.total_recipients ?? 0), 0)
    const skippedRecipients = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.skipped_recipients ?? 0), 0)
    const success = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_success_count ?? campaign.success_count ?? 0), 0)
    const failed = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_failed_count ?? campaign.fail_count ?? 0), 0)
    const pending = filteredCampaigns.reduce((sum, campaign) => sum + (campaign.provider_pending_count ?? 0), 0)

    return {
      totalRecipients,
      skippedRecipients,
      success,
      failed,
      pending,
      failureRate: percent(failed, success + failed + pending),
    }
  }, [filteredCampaigns])
  const detailErrorGroups = useMemo(() => {
    const groups = new Map<string, { code: string; info: NonNullable<ReturnType<typeof getProviderErrorInfo>>; count: number }>()

    detailMessages.forEach((message) => {
      const code = message.provider_status_code
      const info = getProviderErrorInfo(message.provider_name, code)
      if (!code || !info || info.severity === "info") return

      const key = `${message.provider_name || "provider"}:${code}`
      const current = groups.get(key)
      if (current) {
        current.count += 1
      } else {
        groups.set(key, { code, info, count: 1 })
      }
    })

    return Array.from(groups.values()).sort((first, second) => second.count - first.count)
  }, [detailMessages])
  const detailPhoneIssueGroups = useMemo(() => {
    const groups = new Map<string, { issue: PhoneFormatIssue; count: number; examples: string[] }>()

    detailMessages.forEach((message) => {
      const issue = getPhoneFormatIssue(message.recipient)
      if (!issue) return

      const current = groups.get(issue.type)
      if (current) {
        current.count += 1
        if (current.examples.length < 3) current.examples.push(message.recipient)
      } else {
        groups.set(issue.type, { issue, count: 1, examples: [message.recipient] })
      }
    })

    return Array.from(groups.values()).sort((first, second) => second.count - first.count)
  }, [detailMessages])
  const failedDetailMessages = useMemo(
    () => detailMessages.filter((message) => message.status === "failed" || Boolean(message.provider_error)),
    [detailMessages]
  )
  const failedUniqueRecipientCount = useMemo(
    () => new Set(failedDetailMessages.map((message) => normalizePhoneForCompare(message.recipient)).filter(Boolean)).size,
    [failedDetailMessages]
  )
  const suppressionCandidateMessages = useMemo(
    () => failedDetailMessages.filter(isSuppressionCandidate),
    [failedDetailMessages]
  )

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setProviderFilter("all")
    setDlrFilter("all")
    setGroupFilter("all")
    setDateFrom("")
    setDateTo("")
  }

  const applyDatePreset = (preset: "today" | "last7" | "last30" | "month") => {
    const today = new Date()
    const start = new Date(today)

    if (preset === "today") {
      setDateFrom(toDateInputValue(today))
      setDateTo(toDateInputValue(today))
      return
    }
    if (preset === "last7") start.setDate(today.getDate() - 6)
    if (preset === "last30") start.setDate(today.getDate() - 29)

    setDateFrom(preset === "month" ? monthStartInputValue(today) : toDateInputValue(start))
    setDateTo(toDateInputValue(today))
  }

  const handleCancel = async () => {
    if (!cancelTarget) return

    setCancelling(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc("cancel_queued_sms_campaign", {
      p_campaign_id: cancelTarget.id,
    })
    setCancelling(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Kampanya iptal edildi")
    setCancelTarget(null)
    load()
  }

  const openDetails = async (campaign: SmsCampaign) => {
    setDetailTarget(campaign)
    setDetailMessages([])
    setDetailLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) toast.error(error.message)
    setDetailMessages(data ?? [])
    setDetailLoading(false)
  }

  const exportDetailCsv = () => {
    if (!detailTarget) return
    downloadTextFile(
      campaignReportFileName(detailTarget, "csv"),
      `\uFEFF${buildCampaignReportCsv(detailTarget, detailMessages)}`,
      "text/csv;charset=utf-8"
    )
    toast.success("Kampanya raporu CSV olarak indirildi")
  }

  const exportFailedRecipientsCsv = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Bu raporda başarısız alıcı kaydı yok.")
      return
    }

    downloadTextFile(
      campaignReportFileName(detailTarget, "csv").replace(".csv", "-basarisiz-alicilar.csv"),
      `\uFEFF${buildFailedRecipientsCsv(detailTarget, detailMessages)}`,
      "text/csv;charset=utf-8"
    )
    toast.success("Başarısız alıcı listesi CSV olarak indirildi")
  }

  const openFailedRecipientsInContacts = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Kişi temizleme için başarısız alıcı kaydı yok.")
      return
    }

    sessionStorage.setItem(
      "msgnex_failed_cleanup_phones",
      JSON.stringify(failedDetailMessages.map((message) => message.recipient))
    )
    window.location.href = "/contacts?cleanup=failed-campaign"
  }

  const addFailedRecipientsToSuppression = async () => {
    if (!detailTarget) return
    if (suppressionCandidateMessages.length === 0) {
      toast.error("Kara listeye eklenecek numara formatı/provider numara hatası bulunamadı.")
      return
    }

    const confirmed = window.confirm(`${suppressionCandidateMessages.length} başarısız numara kara listeye eklenecek. Sonraki gönderimlerde bu numaralar otomatik atlanır. Devam edilsin mi?`)
    if (!confirmed) return

    const supabase = createClient()
    const reason = `Kampanya başarısız alıcı temizliği: ${detailTarget.name || detailTarget.id}`
    const { data, error } = await supabase.rpc("add_suppression_entries", {
      p_phones: suppressionCandidateMessages.map((message) => message.recipient),
      p_reason: reason,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`${data ?? suppressionCandidateMessages.length} numara kara listeye işlendi`)
  }

  const openFailedRecipientsSegmentModal = () => {
    if (!detailTarget) return
    if (failedDetailMessages.length === 0) {
      toast.error("Segmente aktarılacak başarısız alıcı kaydı yok.")
      return
    }

    setSegmentGroupId("")
    setNewSegmentName(`Kampanya Hatalı Numaralar - ${fileSafeDate(detailTarget.created_at)}`)
    setSegmentModalOpen(true)
  }

  const assignFailedRecipientsToSegment = async () => {
    if (!detailTarget) return
    if (!segmentGroupId && !newSegmentName.trim()) {
      toast.error("Mevcut segment seçin veya yeni segment adı girin.")
      return
    }

    setSegmenting(true)
    const supabase = createClient()
    const { data: profile, error: profileError } = await supabase.from("profiles").select("company_id").maybeSingle()
    if (profileError || !profile?.company_id) {
      toast.error(profileError?.message || "Firma bilgisi alınamadı.")
      setSegmenting(false)
      return
    }

    let targetGroupId = segmentGroupId
    if (!targetGroupId) {
      const { data: createdGroup, error: groupError } = await supabase
        .from("groups")
        .insert({
          company_id: profile.company_id,
          name: newSegmentName.trim(),
          description: "Kampanya raporundan başarısız alıcı temizliği için oluşturuldu.",
        })
        .select("id, company_id, name, description, created_at, updated_at")
        .single()

      if (groupError || !createdGroup) {
        toast.error(groupError?.message || "Segment oluşturulamadı.")
        setSegmenting(false)
        return
      }

      targetGroupId = createdGroup.id
      setGroups((current) => [createdGroup as Group, ...current])
    }

    const failedPhones = new Set(failedDetailMessages.map((message) => normalizePhoneForCompare(message.recipient)).filter(Boolean))
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("company_id", profile.company_id)

    if (contactsError) {
      toast.error(contactsError.message)
      setSegmenting(false)
      return
    }

    const contactIds = (contacts ?? [])
      .filter((contact) => failedPhones.has(normalizePhoneForCompare(contact.phone)))
      .map((contact) => contact.id)

    if (contactIds.length === 0) {
      toast.error("Başarısız numaralar CRM kişi listesinde eşleşmedi.")
      setSegmenting(false)
      return
    }

    const { error: updateError } = await supabase
      .from("contacts")
      .update({ group_id: targetGroupId })
      .in("id", contactIds)

    setSegmenting(false)

    if (updateError) {
      toast.error(updateError.message)
      return
    }

    toast.success(`${contactIds.length} kişi segmente aktarıldı`)
    setSegmentModalOpen(false)
  }

  const printDetailReport = () => {
    if (!detailTarget) return
    const reportWindow = window.open("", "_blank")
    if (!reportWindow) {
      toast.error("Rapor penceresi açılamadı. Tarayıcı pop-up iznini kontrol edin.")
      return
    }

    reportWindow.document.write(buildCampaignReportHtml(detailTarget, detailMessages))
    reportWindow.document.close()
    reportWindow.focus()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kampanyalar" description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin." />
        <LoadingState variant="table" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kampanyalar" description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin." />
        <ErrorState description={error} onRetry={load} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kampanyalar"
        description="Toplu SMS gönderimlerinin operasyon ve provider durumlarını takip edin."
        actions={<Button variant="secondary" onClick={load}>Yenile</Button>}
      />

      <Card title="Son Kampanyalar">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Kuyruktaki kampanyaları iptal edebilirsiniz. Gönderilmeye başlanmış kampanyalar çift SMS riskini önlemek için otomatik tekrar gönderilmez.
        </div>

        <CampaignFilters
          search={search}
          statusFilter={statusFilter}
          providerFilter={providerFilter}
          dlrFilter={dlrFilter}
          groupFilter={groupFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          showFilters={showFilters}
          hasActiveFilters={hasActiveFilters}
          resultCount={filteredCampaigns.length}
          providerOptions={providerOptions}
          groups={groups}
          summary={filteredSummary}
          onSearchChange={setSearch}
          onStatusFilterChange={setStatusFilter}
          onProviderFilterChange={setProviderFilter}
          onDlrFilterChange={setDlrFilter}
          onGroupFilterChange={setGroupFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          onApplyDatePreset={applyDatePreset}
        />

        <CampaignList
          campaigns={filteredCampaigns}
          groupMap={groupMap}
          hasActiveFilters={hasActiveFilters}
          onOpenDetails={openDetails}
          onCancelCampaign={setCancelTarget}
          onClearFilters={clearFilters}
          onReload={load}
        />
      </Card>

      {cancelTarget && (
        <CampaignCancelModal
          campaign={cancelTarget}
          cancelling={cancelling}
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {detailTarget && (
        <CampaignDetailModal
          campaign={detailTarget}
          messages={detailMessages}
          loading={detailLoading}
          errorGroups={detailErrorGroups}
          phoneIssueGroups={detailPhoneIssueGroups}
          failedMessages={failedDetailMessages}
          failedUniqueRecipientCount={failedUniqueRecipientCount}
          suppressionCandidateCount={suppressionCandidateMessages.length}
          onExportCsv={exportDetailCsv}
          onExportFailedCsv={exportFailedRecipientsCsv}
          onOpenFailedContacts={openFailedRecipientsInContacts}
          onOpenFailedSegmentModal={openFailedRecipientsSegmentModal}
          onAddFailedToSuppression={addFailedRecipientsToSuppression}
          onPrintReport={printDetailReport}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {segmentModalOpen && detailTarget && (
        <FailedRecipientsSegmentModal
          campaign={detailTarget}
          groups={groups}
          selectedGroupId={segmentGroupId}
          newSegmentName={newSegmentName}
          failedCount={failedDetailMessages.length}
          failedUniqueRecipientCount={failedUniqueRecipientCount}
          suppressionCandidateCount={suppressionCandidateMessages.length}
          segmenting={segmenting}
          onSelectedGroupChange={setSegmentGroupId}
          onNewSegmentNameChange={setNewSegmentName}
          onConfirm={assignFailedRecipientsToSegment}
          onClose={() => setSegmentModalOpen(false)}
        />
      )}
    </div>
  )
}
