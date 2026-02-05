import { Check, ChevronDown, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"

function CopyableBlock({
  title,
  description,
  content,
  defaultOpen = false,
}: {
  title: string
  description?: string
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
        <div>
          <span className="text-sm font-medium">{title}</span>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
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

const JINJA_MACRO_DEF =
  "{% macro paginate(limit, offset) %}\n" +
  "LIMIT {{ limit }} OFFSET {{ offset }}\n" +
  "{% endmacro %}"

const JINJA_USAGE =
  "{% set limit = limit | sql_int %}\n" +
  "{% set offset = offset | sql_int %}\n" +
  "SELECT * FROM user {{ paginate(limit, offset) }}"

const PYTHON_MACRO_FUNC =
  "def fetch_from_api(url):\n" +
  "    resp = http.get(url)\n" +
  '    return resp.get("json") or {}'

const PYTHON_HELPERS =
  "def safe_int(val, default=0):\n" +
  "    try:\n" +
  "        return int(val) if val is not None else default\n" +
  "    except (TypeError, ValueError):\n" +
  "        return default\n\n" +
  "def is_valid_email(s):\n" +
  "    return bool(s and isinstance(s, str) and \"@\" in s and \".\" in s)"

const PYTHON_SCRIPT_USAGE =
  'config = fetch_from_api("https://api.example.com/config")\n' +
  'rows = db.query("SELECT * FROM users WHERE type = %s", [config.get("type")])\n' +
  "result = rows"

export default function MacroDefUsageGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Macro definition create &amp; edit guide</h2>
        <p className="text-sm text-muted-foreground mt-1">
          End-to-end: create Jinja macros (reused in SQL API content) or Python functions (reused in Script API, parameter validate, result transform).
        </p>
      </div>

      <Tabs defaultValue="jinja" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="jinja">Jinja</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
        </TabsList>

        <TabsContent value="jinja" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Jinja macros live in Macro Defs (per module or global). Any SQL API in the same module can call them. Define with {"{% macro name(args) %} ... {% endmacro %}"}.
          </p>
          <CopyableBlock
            title="1. Macro definition (Macro Def content)"
            description="Reusable block of SQL; use in API content with {{ name(args) }}"
            content={JINJA_MACRO_DEF}
          />
          <CopyableBlock
            title="2. Usage in SQL API content"
            description="Assign filtered values first (sql_int, etc.), then call the macro. Avoid nesting {{ }} inside {% set %}."
            content={JINJA_USAGE}
          />
        </TabsContent>

        <TabsContent value="python" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Python macro defs expose helpers that can use http, db, cache, req. They are auto-prepended to Script API content, parameter validate, and result transform in the same scope.
          </p>
          <CopyableBlock
            title="1. Function with http/db (macro content)"
            description="Can call http.get, db.query, cache, req. Reused in Script API content."
            content={PYTHON_MACRO_FUNC}
          />
          <CopyableBlock
            title="2. Pure helpers for validate/transform"
            description="No http/db; used in parameter validate and result transform. Macro code is auto-prepended there."
            content={PYTHON_HELPERS}
          />
          <CopyableBlock
            title="3. Usage in Script API content"
            description="Call functions from macro_defs (e.g. fetch_from_api). Use req.get() for params, db.query() for DB."
            content={PYTHON_SCRIPT_USAGE}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
