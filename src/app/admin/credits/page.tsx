"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, THead, TBody, Th, Td, Tr } from "@/components/ui/table"
import toast from "react-hot-toast"
import type { Company, ProviderWallet } from "@/types"

export default function CreditsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [credits, setCredits] = useState<Record<string, number>>({})
  const [wallets, setWallets] = useState<ProviderWallet[]>([])
  const [selectedCompany, setSelectedCompany] = useState("")
  const [selectedWallet, setSelectedWallet] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [providerName, setProviderName] = useState("")
  const [purchaseCredits, setPurchaseCredits] = useState("")
  const [paidAmount, setPaidAmount] = useState("")
  const [currency, setCurrency] = useState("TRY")
  const [purchaseNote, setPurchaseNote] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const supabase = createClient()
    const [{ data: companies }, { data: credits }, { data: wallets }] = await Promise.all([
      supabase.from("companies").select("*").order("name"),
      supabase.from("sms_credits").select("*"),
      supabase.from("provider_wallets").select("*").order("provider_name"),
    ])

    const creditMap: Record<string, number> = {}
    credits?.forEach((credit: { company_id: string; balance: number }) => {
      creditMap[credit.company_id] = credit.balance
    })

    setCompanies(companies ?? [])
    setCredits(creditMap)
    setWallets(wallets ?? [])
    setSelectedWallet((current) => current || wallets?.[0]?.id || "")
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handlePurchase = async () => {
    const creditsToAdd = parseInt(purchaseCredits)
    const paid = parseFloat(paidAmount.replace(",", "."))
    if (!providerName.trim() || creditsToAdd <= 0 || paid <= 0) return

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.rpc("purchase_provider_credits", {
      p_provider_name: providerName.trim(),
      p_credits: creditsToAdd,
      p_paid_amount: paid,
      p_currency: currency.trim() || "TRY",
      p_note: purchaseNote.trim() || null,
    })

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    setPurchaseCredits("")
    setPaidAmount("")
    setPurchaseNote("")
    toast.success(`${creditsToAdd} sağlayıcı kredisi havuza eklendi`)
    load()
  }

  const handleAllocateCredits = async () => {
    const creditsToAllocate = parseInt(amount)
    if (!selectedWallet || !selectedCompany || creditsToAllocate <= 0) return

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.rpc("allocate_customer_credits", {
      p_provider_wallet_id: selectedWallet,
      p_company_id: selectedCompany,
      p_credits: creditsToAllocate,
      p_note: note.trim() || null,
    })

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    setAmount("")
    setNote("")
    toast.success(`${creditsToAllocate} kredi müşteriye aktarıldı`)
    load()
  }

  if (loading) return <p>Yükleniyor...</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kredi Yönetimi</h1>
        <p className="text-sm text-gray-500">Toptan SMS kredilerini kaydedin ve müşterilere dağıtın.</p>
      </div>

      <Card title="Sağlayıcıdan Kredi Alımı Kaydet">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Sağlayıcı"
            placeholder="Örn: Infobip"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
          />
          <Input
            label="Alınan SMS Kredisi"
            type="number"
            min="1"
            placeholder="Örn: 2500"
            value={purchaseCredits}
            onChange={(e) => setPurchaseCredits(e.target.value)}
          />
          <Input
            label="Ödenen Tutar"
            type="number"
            min="0"
            step="0.01"
            placeholder="Örn: 1000"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
          />
          <Input
            label="Para Birimi"
            placeholder="TRY"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
          <Input
            label="Not (opsiyonel)"
            placeholder="Paket veya fatura bilgisi"
            value={purchaseNote}
            onChange={(e) => setPurchaseNote(e.target.value)}
          />
        </div>
        <Button
          className="mt-4"
          onClick={handlePurchase}
          disabled={saving || !providerName.trim() || !purchaseCredits || !paidAmount}
        >
          Havuz Bakiyesi Ekle
        </Button>
      </Card>

      <Card title="Sağlayıcı Havuzları">
        <Table>
          <THead>
            <Tr>
              <Th>Sağlayıcı</Th>
              <Th>Para Birimi</Th>
              <Th>Dağıtılabilir Kredi</Th>
            </Tr>
          </THead>
          <TBody>
            {wallets.map((wallet) => (
              <Tr key={wallet.id}>
                <Td className="font-medium">{wallet.provider_name}</Td>
                <Td>{wallet.currency}</Td>
                <Td className="text-lg font-bold text-primary-600">{wallet.balance}</Td>
              </Tr>
            ))}
            {wallets.length === 0 && (
              <Tr>
                <Td colSpan={3} className="text-center text-gray-500">Henüz sağlayıcı kredisi eklenmedi.</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>

      <Card title="Müşteriye Havuzdan Kredi Aktar">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kaynak Havuz</label>
            <select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Seçiniz</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.provider_name} (Dağıtılabilir: {wallet.balance})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Seçiniz</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} (Mevcut: {credits[company.id] ?? 0})
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Kredi Miktarı"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
          <Input
            label="Açıklama (opsiyonel)"
            placeholder="Müşteriye satış bilgisi"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAllocateCredits} disabled={saving || !selectedWallet}>
            Aktar
          </Button>
        </div>
      </Card>

      <Card title="Firma Kredileri">
        <Table>
          <THead>
            <Tr>
              <Th>Firma</Th>
              <Th>SMS Başlığı</Th>
              <Th>Mevcut Kredi</Th>
            </Tr>
          </THead>
          <TBody>
            {companies.map((company) => (
              <Tr key={company.id}>
                <Td className="font-medium">{company.name}</Td>
                <Td>
                  <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                    {company.sender_name || "-"}
                  </span>
                </Td>
                <Td className="text-lg font-bold text-primary-600">{credits[company.id] ?? 0}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  )
}
