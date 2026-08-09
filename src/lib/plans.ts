export type CompanyPlan = "starter" | "professional" | "agency"
export type PlanFeature = "api_access" | "audit_log" | "webhook"

export interface PlanLimits {
  users: number
  contacts: number
  campaignRecipients: number
}

export const PLAN_LABELS: Record<CompanyPlan, string> = {
  starter: "Başlangıç",
  professional: "Profesyonel",
  agency: "Ajans / Kurumsal",
}

const FEATURE_PLANS: Record<PlanFeature, CompanyPlan[]> = {
  api_access: ["professional", "agency"],
  audit_log: ["professional", "agency"],
  webhook: ["agency"],
}

export const PLAN_LIMITS: Record<CompanyPlan, PlanLimits> = {
  starter: { users: 2, contacts: 500, campaignRecipients: 250 },
  professional: { users: 10, contacts: 10000, campaignRecipients: 1000 },
  agency: { users: 50, contacts: 100000, campaignRecipients: 1000 },
}

export function isCompanyPlan(value: string): value is CompanyPlan {
  return value === "starter" || value === "professional" || value === "agency"
}

export function companyPlanHasFeature(plan: CompanyPlan, feature: PlanFeature) {
  return FEATURE_PLANS[feature].includes(plan)
}
