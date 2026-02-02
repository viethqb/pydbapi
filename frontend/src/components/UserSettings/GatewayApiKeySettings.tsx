import { useState, useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"
import { getGatewayApiKey, setGatewayApiKey } from "@/lib/gatewayApiKey"

export default function GatewayApiKeySettings() {
  const { showSuccessToast } = useCustomToast()
  const [value, setValue] = useState("")

  useEffect(() => {
    setValue(getGatewayApiKey() ?? "")
  }, [])

  const handleSave = () => {
    setGatewayApiKey(value.trim() || null)
    showSuccessToast("Gateway API Key saved")
  }

  const handleClear = () => {
    setValue("")
    setGatewayApiKey(null)
    showSuccessToast("Gateway API Key cleared")
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Gateway API Key (JWT)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          JWT for calling private APIs. Obtain from{" "}
          <strong>POST /api/token/generate</strong> with{" "}
          <code className="text-xs bg-muted px-1 rounded">client_id</code> and{" "}
          <code className="text-xs bg-muted px-1 rounded">client_secret</code>. Used when testing
          private APIs in API Repository and API Dev.
        </p>
      </div>
      <div className="space-y-2 max-w-md">
        <Label htmlFor="gateway-api-key">API Key (JWT)</Label>
        <Input
          id="gateway-api-key"
          type="password"
          placeholder="Paste JWT from /token/generate"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="outline" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
