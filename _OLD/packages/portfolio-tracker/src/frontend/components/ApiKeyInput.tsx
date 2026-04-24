// src/frontend/components/ApiKeyInput.tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

interface Props {
  readonly label: string
  readonly secretName: string
}

export function ApiKeyInput({ label, secretName }: Props) {
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  )

  async function handleSave() {
    setStatus("saving")
    try {
      await api.setSecret(secretName, value)
      setStatus("saved")
      setValue("")
      setTimeout(() => setStatus("idle"), 2000)
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={secretName}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={secretName}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter API key..."
          className="font-mono"
        />
        <Button onClick={handleSave} disabled={!value || status === "saving"}>
          {status === "saving"
            ? "Saving..."
            : status === "saved"
              ? "Saved!"
              : "Save"}
        </Button>
      </div>
      {status === "error" && (
        <p className="text-sm text-destructive">Failed to save key</p>
      )}
    </div>
  )
}
