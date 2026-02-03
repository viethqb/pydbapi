import { Check, ChevronDown, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"

type Example = {
  title: string
  description?: string
  code: string
}

function CodeExample({ title, description, code }: Example) {
  const { showErrorToast, showSuccessToast } = useCustomToast()
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === code

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={async () => {
            const ok = await copy(code)
            if (ok) showSuccessToast("Code copied")
            else showErrorToast("Copy failed")
          }}
          title="Copy code"
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>

      <pre className="p-3 bg-muted rounded-md overflow-auto text-sm leading-relaxed font-mono whitespace-pre">
        {code}
      </pre>
    </div>
  )
}

const MACRO_EXAMPLES: Example[] = [
  {
    title: "Jinja – Macro definition",
    description: "Define a reusable block of SQL with {% macro name(args) %} ... {% endmacro %}. Macros live in Macro Defs and can be used by any SQL API in the same module.",
    code:
      "{% macro paginate(limit, offset) %}\n" +
      "LIMIT {{ limit }} OFFSET {{ offset }}\n" +
      "{% endmacro %}",
  },
  {
    title: "Jinja – Usage in SQL API content",
    description:
      "Inside API content, call the macro with {{ paginate(limit, offset) }} after cleaning inputs via filters (limit | sql_int, offset | sql_int). Avoid nesting {{ }} inside {% set %}; assign filtered values first, then call the macro.",
    code:
      "{% set limit = limit | sql_int %}\n" +
      "{% set offset = offset | sql_int %}\n" +
      "SELECT * FROM user {{ paginate(limit, offset) }}",
  },
  {
    title: "Python – Function definition (macro)",
    description:
      "Define Python helpers that can call http, db, cache, req. These functions can be reused in Script API content, parameter validate functions, and result transform scripts.",
    code:
      "def fetch_from_api(url):\n" +
      "    resp = http.get(url)\n" +
      '    return resp.get("json") or {}',
  },
  {
    title: "Python – Helpers for validate/transform",
    description:
      "Pure helpers (no http/db) for parameter validate and result transform. Macro code is auto-prepended before each validate/transform, so these functions are always available there.",
    code:
      "def safe_int(val, default=0):\n" +
      "    try:\n" +
      "        return int(val) if val is not None else default\n" +
      "    except (TypeError, ValueError):\n" +
      "        return default\n\n" +
      "def is_valid_email(s):\n" +
      "    return bool(s and isinstance(s, str) and \"@\" in s and \".\" in s)",
  },
  {
    title: "Python – Usage in Script API content",
    description:
      "In Script API content you can call functions defined in macro_defs (e.g. fetch_from_api). Use req.get() for parameters and db.query() for database access; the same helpers can also be called from validate/transform.",
    code:
      'config = fetch_from_api("https://api.example.com/config")\n' +
      'rows = db.query("SELECT * FROM users WHERE type = %s", [config.get("type")])\n' +
      "result = rows",
  },
]

export default function MacroExamples() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium">Macro examples & usage guide</div>
          <div className="text-xs text-muted-foreground">
            Jinja macros are reused across SQL APIs; Python macros expose shared helpers for Script APIs, parameter validate, and result transform.
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">
          {MACRO_EXAMPLES.map((ex) => (
            <CodeExample
              key={ex.title}
              title={ex.title}
              description={ex.description}
              code={ex.code}
            />
          ))}
        </div>
      )}
    </div>
  )
}
