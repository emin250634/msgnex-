export type AutomationType = "welcome" | "birthday" | "inactive" | "campaign" | "payment"
export type AutomationStatus = "active" | "inactive"
export type QueueStatus = "pending" | "approved" | "rejected"

export interface AutomationRuleMock {
  id: string
  name: string
  type: AutomationType
  templateName: string
  segmentName: string
  status: AutomationStatus
  requiresApproval: boolean
  lastRunAt: string | null
  candidateCount: number
}

export interface AutomationCandidateMock {
  id: string
  automationName: string
  contactName: string
  phone: string
  segmentName: string
  messagePreview: string
  scheduledFor: string
  status: QueueStatus
}

export interface AutomationRunMock {
  id: string
  automationName: string
  type: AutomationType
  runAt: string
  candidateCount: number
  approvedCount: number
  rejectedCount: number
  status: "completed" | "review" | "failed"
}

export const automationTypeLabels: Record<AutomationType, string> = {
  welcome: "Hoş geldin",
  birthday: "Doğum günü",
  inactive: "Pasif müşteri",
  campaign: "Kampanya duyurusu",
  payment: "Vade / ödeme",
}

export const automationRules: AutomationRuleMock[] = [
  {
    id: "auto-welcome",
    name: "Yeni müşteri hoş geldin",
    type: "welcome",
    templateName: "Esans Shop Hoş Geldin",
    segmentName: "Yeni Kayıtlar",
    status: "active",
    requiresApproval: true,
    lastRunAt: "2026-06-04T09:30:00",
    candidateCount: 8,
  },
  {
    id: "auto-vip-campaign",
    name: "VIP indirim duyurusu",
    type: "campaign",
    templateName: "VIP Müşteri İndirimi",
    segmentName: "VIP Müşteriler",
    status: "active",
    requiresApproval: true,
    lastRunAt: "2026-06-03T16:15:00",
    candidateCount: 24,
  },
  {
    id: "auto-inactive",
    name: "Pasif müşteri hatırlatma",
    type: "inactive",
    templateName: "Sizi Özledik",
    segmentName: "60 Gün Pasif",
    status: "inactive",
    requiresApproval: true,
    lastRunAt: null,
    candidateCount: 0,
  },
  {
    id: "auto-birthday",
    name: "Doğum günü tebriği",
    type: "birthday",
    templateName: "Doğum Günü Sürprizi",
    segmentName: "Tüm Müşteriler",
    status: "inactive",
    requiresApproval: true,
    lastRunAt: null,
    candidateCount: 0,
  },
]

export const automationCandidates: AutomationCandidateMock[] = [
  {
    id: "cand-1",
    automationName: "Yeni müşteri hoş geldin",
    contactName: "Ayşe Demir",
    phone: "05551234567",
    segmentName: "Yeni Kayıtlar",
    messagePreview: "Esans Shop'a hoş geldiniz. Size özel kampanya ve fırsatlardan SMS ile haberdar olabilirsiniz.",
    scheduledFor: "2026-06-04T14:00:00",
    status: "pending",
  },
  {
    id: "cand-2",
    automationName: "VIP indirim duyurusu",
    contactName: "Mehmet Kaya",
    phone: "05559876543",
    segmentName: "VIP Müşteriler",
    messagePreview: "Esans Shop VIP müşterilerine özel indirim başladı. Favori esanslarınızda avantajlı fiyatları kaçırmayın.",
    scheduledFor: "2026-06-04T15:30:00",
    status: "pending",
  },
  {
    id: "cand-3",
    automationName: "Pasif müşteri hatırlatma",
    contactName: "Zeynep Aksoy",
    phone: "05557654321",
    segmentName: "60 Gün Pasif",
    messagePreview: "Sizi özledik. Esans Shop'ta sevdiğiniz kokular ve yeni ürünler sizi bekliyor.",
    scheduledFor: "2026-06-05T10:00:00",
    status: "pending",
  },
]

export const automationRuns: AutomationRunMock[] = [
  {
    id: "run-1",
    automationName: "Yeni müşteri hoş geldin",
    type: "welcome",
    runAt: "2026-06-04T09:30:00",
    candidateCount: 8,
    approvedCount: 6,
    rejectedCount: 2,
    status: "completed",
  },
  {
    id: "run-2",
    automationName: "VIP indirim duyurusu",
    type: "campaign",
    runAt: "2026-06-03T16:15:00",
    candidateCount: 24,
    approvedCount: 24,
    rejectedCount: 0,
    status: "completed",
  },
  {
    id: "run-3",
    automationName: "Pasif müşteri hatırlatma",
    type: "inactive",
    runAt: "2026-06-02T11:00:00",
    candidateCount: 14,
    approvedCount: 0,
    rejectedCount: 0,
    status: "review",
  },
]
