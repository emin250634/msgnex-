"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils/cn"

interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
}

let addToast: (t: Omit<Toast, "id">) => void = () => {}

export function showToast(message: string, type: Toast["type"] = "info") {
  addToast({ message, type })
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    addToast = (t) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { ...t, id }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id))
      }, 4000)
    }
    return () => { addToast = () => {} }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all",
            t.type === "success" && "bg-green-600 text-white",
            t.type === "error" && "bg-red-600 text-white",
            t.type === "info" && "bg-gray-800 text-white"
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
