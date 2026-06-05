import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"

const companyRoles = new Set(["customer", "company_owner", "company_admin", "company_user"])

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "admin") redirect("/admin/dashboard")
  if (!profile || !profile.is_active || !companyRoles.has(profile.role)) redirect("/login")

  return <AppShell profile={profile}>{children}</AppShell>
}
