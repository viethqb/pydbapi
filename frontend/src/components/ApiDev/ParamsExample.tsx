import { Check, ChevronDown, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"

const DATA_TYPES_TEXT =
  "Data types (DBAPI converts raw HTTP input to these before your SQL/Jinja or Python runs):\n\n" +
  "  string   — Text; leading/trailing spaces trimmed.\n" +
  "            Example: \"hello\", \"  abc  \" → \"abc\".\n\n" +
  "  integer  — Whole number. Accepts int or numeric string.\n" +
  "            Example: 42, \"100\".\n\n" +
  "  number   — Float. Accepts int, float or numeric string.\n" +
  "            Example: 3.14, \"1.5\".\n\n" +
  "  boolean  — true/false. Accepts: true, false, 1, 0, \"true\", \"false\", \"yes\", \"no\".\n" +
  "            Example: true, \"yes\", 1.\n\n" +
  "  array    — List. Accepts JSON array string or comma-separated string.\n" +
  "            Example: [1, 2, 3], \"[1,2,3]\", \"a,b,c\".\n\n" +
  "  object   — Key-value. Accepts JSON object string only.\n" +
  "            Example: {\"a\": 1, \"b\": 2}, \"{\\\"key\\\": \\\"value\\\"}\".\n\n" +
  "If a value cannot be converted to the selected type, DBAPI returns a 400 validation error before executing your engine."

const EXAMPLE_PARAMS_TEXT =
  "Example parameter definitions (as you would configure them in Basic Info → Parameters):\n\n" +
  "  • limit      (query,  integer, required=false, default=10)\n" +
  "  • offset     (query,  integer, required=false, default=0)\n" +
  "  • id         (query,  integer, required=true)\n" +
  "  • q          (query,  string,  required=false) — search text\n" +
  "  • active     (query,  boolean, required=false, default=true)\n" +
  "  • ids        (query,  array,   required=false) — e.g. [1,2,3]\n" +
  "  • X-User-Id  (header, string,  required=false) — current user id\n" +
  "  • payload    (body,   object,  required=false) — JSON body with nested fields"

const EXAMPLE_DATA_JSON =
  '{\n  "limit": 10,\n  "offset": 0,\n  "id": 1,\n  "q": "search text",\n  "active": true,\n  "ids": [1, 2, 3]\n}'

function CopyableBlock({
  title,
  content,
  defaultOpen = false,
}: {
  title: string
  content: string
  defaultOpen?: boolean
}) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [copiedText, copy] = useCopyToClipboard()
  const [open, setOpen] = useState(defaultOpen)
  const isCopied = copiedText === content

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 flex items-start gap-2">
          <pre className="flex-1 p-3 bg-muted rounded-md overflow-auto text-sm leading-relaxed font-mono whitespace-pre">
            {content}
          </pre>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={async () => {
              const ok = await copy(content)
              if (ok) showSuccessToast("Copied")
              else showErrorToast("Copy failed")
            }}
            title="Copy"
          >
            {isCopied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function ParamsExample() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium">Parameters example</div>
          <div className="text-xs text-muted-foreground">
            Data types, parameter definitions, and example request data
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <CopyableBlock title="Data types" content={DATA_TYPES_TEXT} />
          <CopyableBlock title="Example parameter definitions" content={EXAMPLE_PARAMS_TEXT} />
          <CopyableBlock title="Example data (JSON)" content={EXAMPLE_DATA_JSON} />
        </div>
      )}
    </div>
  )
}
