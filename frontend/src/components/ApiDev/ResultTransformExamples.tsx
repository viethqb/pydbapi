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

const EXAMPLES: Example[] = [
  {
    title: "Passthrough",
    description: "Smallest possible transform: return the executor result as-is. Useful as a template; you can still call macro helpers here.",
    code:
      "def transform(result, params=None):\n" +
      '    """Transform raw executor result. params = request params dict."""\n' +
      "    return result\n",
  },
  {
    title: "Add offset/limit + flatten 2-statement SQL",
    description:
      "Typical pattern for paginated SQL that returns [[rows], [{total}]]. Unwrap both parts into a flat result, then attach offset/limit. You can refactor numeric parsing into a macro helper (e.g. safe_int).",
    code:
      "def transform(result, params=None):\n" +
      "    p = params or {}\n" +
      "    limit = int(p.get(\"limit\", 10))\n" +
      "    offset = int(p.get(\"offset\", 0))\n" +
      "    d = result.get(\"data\", [])\n" +
      "    if isinstance(d, list) and len(d) >= 2:\n" +
      "        rows = d[0] if isinstance(d[0], list) else d[0]\n" +
      "        total_val = d[1][0].get(\"total\", len(rows)) if d[1] else len(rows)\n" +
      "        result[\"data\"] = rows\n" +
      "        result[\"total\"] = total_val\n" +
      "    result[\"offset\"] = offset\n" +
      "    result[\"limit\"] = limit\n" +
      "    return result\n",
  },
  {
    title: "Use macro helper (safe_int from macro_def)",
    description:
      "Demonstrates how to call safe_int defined in a Python macro_def to normalize numeric parameters before using them in the final payload.",
    code:
      "def transform(result, params=None):\n" +
      "    p = params or {}\n" +
      "    # safe_int() defined in a Python macro_def\n" +
      "    result[\"limit\"] = safe_int(p.get(\"limit\"), 10)\n" +
      "    result[\"offset\"] = safe_int(p.get(\"offset\"), 0)\n" +
      "    return result\n",
  },
  {
    title: "Add offset/limit (single SELECT)",
    description:
      "For a single SELECT that returns [[rows]], unwrap the inner list and attach offset/limit metadata. Works well with SQL that does not compute total separately.",
    code:
      "def transform(result, params=None):\n" +
      "    p = params or {}\n" +
      "    limit = int(p.get(\"limit\", 10))\n" +
      "    offset = int(p.get(\"offset\", 0))\n" +
      "    d = result.get(\"data\", [])\n" +
      "    if isinstance(d, list) and len(d) == 1 and isinstance(d[0], list):\n" +
      "        result[\"data\"] = d[0]\n" +
      "    result[\"offset\"] = offset\n" +
      "    result[\"limit\"] = limit\n" +
      "    return result\n",
  },
  {
    title: "Pick fields from rows",
    description:
      "Transform each row to a lighter shape (id, name only). You can move the projection logic into a macro helper like pick_keys for reuse.",
    code:
      "def transform(result, params=None):\n" +
      "    d = result.get(\"data\", [])\n" +
      "    rows = d[0] if isinstance(d, list) and d and isinstance(d[0], list) else (d if isinstance(d, list) else [])\n" +
      "    result[\"data\"] = [{\"id\": r.get(\"id\"), \"name\": r.get(\"name\")} for r in rows]\n" +
      "    return result\n",
  },
  {
    title: "Add computed field",
    description:
      "Attach a new field derived from existing columns (e.g. full_name from first_name + last_name). This logic is also a good candidate for a macro helper such as build_full_name.",
    code:
      "def transform(result, params=None):\n" +
      "    d = result.get(\"data\", [])\n" +
      "    rows = d[0] if isinstance(d, list) and d and isinstance(d[0], list) else (d if isinstance(d, list) else [])\n" +
      "    for r in rows:\n" +
      "        r['full_name'] = f\"{r.get('first_name', '')} {r.get('last_name', '')}\".strip()\n" +
      "    result[\"data\"] = rows\n" +
      "    return result\n",
  },
  {
    title: "Filter rows",
    description:
      "Filter the data returned by the executor (e.g. keep only rows where is_active is true). For complex conditions, extract them into a macro helper like filter_active.",
    code:
      "def transform(result, params=None):\n" +
      "    d = result.get(\"data\", [])\n" +
      "    rows = d[0] if isinstance(d, list) and d and isinstance(d[0], list) else (d if isinstance(d, list) else [])\n" +
      "    result[\"data\"] = [r for r in rows if r.get(\"is_active\", True)]\n" +
      "    return result\n",
  },
]

export default function ResultTransformExamples() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border mt-4">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium">Result transform (Python) examples</div>
          <div className="text-xs text-muted-foreground">
            transform(result, params=None) → result. Runs after SQL/Jinja or Script execution, before sending the response. You can call functions from Python macro_defs; macro code is auto-prepended.
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-4">
          {EXAMPLES.map((ex) => (
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
