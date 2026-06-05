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

// Development reference only. Production UI must not render fake automation
// rules, candidates, runs, phone numbers, customer names, or campaign history.
export const automationRules: AutomationRuleMock[] = []
export const automationCandidates: AutomationCandidateMock[] = []
export const automationRuns: AutomationRunMock[] = []
