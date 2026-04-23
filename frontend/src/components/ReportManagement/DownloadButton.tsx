import { Download, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { API_BASE, getAuthToken } from "@/lib/api-request"

type DownloadButtonProps = {
  executionId: string
  fallbackFilename?: string
}

/**
 * Download button that streams the report file from MinIO via the backend
 * proxy endpoint. Shows a spinner while the fetch is in flight so the user
 * sees progress on large reports (~50MB+).
 */
export function DownloadButton({
  executionId,
  fallbackFilename,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    if (isDownloading) return
    setError(null)
    setIsDownloading(true)
    try {
      const token = await getAuthToken()
      const resp = await fetch(
        `${API_BASE}/api/v1/report-executions/${executionId}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      if (!resp.ok) {
        const text = await resp.text().catch(() => "")
        setError(text || `Download failed (${resp.status})`)
        return
      }
      // Prefer Content-Disposition filename when present.
      const disposition = resp.headers.get("content-disposition") || ""
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition)
      const headerName = match?.[1]?.replace(/^["']|["']$/g, "")
      const filename = headerName || fallbackFilename || "report.xlsx"

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDownload}
        disabled={isDownloading}
        aria-busy={isDownloading}
        title={isDownloading ? "Downloading..." : "Download report"}
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
      {error ? (
        <span
          className="text-xs text-destructive max-w-[180px] truncate"
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}
