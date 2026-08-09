interface AuditLogInput {
  adminClient: any
  actorUserId: string | null
  actorRole?: string | null
  action: string
  targetType: string
  targetId?: string | null
  companyId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog({
  adminClient,
  actorUserId,
  actorRole = "admin",
  action,
  targetType,
  targetId = null,
  companyId = null,
  metadata = {},
}: AuditLogInput) {
  try {
    await adminClient.from("audit_logs").insert({
      actor_user_id: actorUserId,
      actor_role: actorRole,
      action,
      target_type: targetType,
      target_id: targetId,
      company_id: companyId,
      metadata,
    })
  } catch {
    // Audit logging must not break the primary admin action.
  }
}
