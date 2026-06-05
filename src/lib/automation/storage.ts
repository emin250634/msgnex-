"use client"

import type { AutomationCandidateMock, AutomationRuleMock } from "@/lib/automation/mock-data"

// Cleanup Sprint 1: localStorage persistence is disabled for production safety.
// Automation data must come from a real backend before it is shown as active.
export function loadAutomationRules(): AutomationRuleMock[] {
  return []
}

export function saveAutomationRules(_rules: AutomationRuleMock[]) {
  return
}

export function loadAutomationCandidates(): AutomationCandidateMock[] {
  return []
}

export function saveAutomationCandidates(_candidates: AutomationCandidateMock[]) {
  return
}
