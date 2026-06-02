"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import type { SmsCredit, CreditTransaction } from "@/types"

export default function BalancePage() {
  const [credits, setCredits] = useState<SmsCredit | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const load = async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle()
      if (!profile?.company_id) { setLoading(false); return }

      const { data: creditData } = await supabase
        .from("sms_credits")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle()
      setCredits(creditData)

      const { data: txData } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
      setTransactions(txData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bakiye</h1>

      <Card title="SMS Kredi Bakiyesi">
        <p className="text-4xl font-bold text-primary-600">{credits?.balance ?? 0}</p>
        <p className="text-sm text-gray-500">kalan SMS kredisi</p>
      </Card>

      <Card title="Kredi Hareketleri">
        <Table>
          <THead>
            <Tr>
              <Th>Tür</Th>
              <Th>Tutar</Th>
              <Th>Açıklama</Th>
              <Th>Tarih</Th>
            </Tr>
          </THead>
          <TBody>
            {transactions.map((tx) => (
              <Tr key={tx.id}>
                <Td>{tx.type === "add" ? "Yükleme" : tx.type === "deduct" ? "Kullanım" : tx.type === "refund" ? "İade" : "Satın Alma"}</Td>
                <Td className={tx.amount > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </Td>
                <Td>{tx.note || "-"}</Td>
                <Td className="text-sm text-gray-500">
                  {new Date(tx.created_at).toLocaleString("tr-TR")}
                </Td>
              </Tr>
            ))}
            {transactions.length === 0 && (
              <Tr>
                <Td colSpan={4} className="text-center text-gray-500">Hareket bulunamadı</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
