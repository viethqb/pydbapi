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
    description: "Function: transform(result, params=None). Input: result, params. Output: result unchanged.",
    code:
      "def transform(result, params=None):\n" +
      '    """Transform raw executor result. params = request params dict."""\n' +
      "    return result\n",
  },
  {
    title: "Wrap in {data}",
    description: "Function: transform(result, params=None). Input: result. Output: {\"data\": result, \"ok\": true}.",
    code:
      "def transform(result, params=None):\n" +
      "    return {\"data\": result, \"ok\": True}\n",
  },
  {
    title: "Pick fields",
    description: "Function: transform(result, params=None). Input: result (list or dict). Output: list/dict with only id and name keys.",
    code:
      "def transform(result, params=None):\n" +
      "    if isinstance(result, list):\n" +
      "        return [{\"id\": r.get(\"id\"), \"name\": r.get(\"name\")} for r in result]\n" +
      "    return {\"id\": result.get(\"id\"), \"name\": result.get(\"name\")}\n",
  },
  {
    title: "Add computed field",
    description: "Function: transform(result, params=None). Input: result (list of dicts). Output: same list with full_name added to each row.",
    code:
      "def transform(result, params=None):\n" +
      "    if isinstance(result, list):\n" +
      "        for r in result:\n" +
      "            r[\"full_name\"] = f\"{r.get('first_name', '')} {r.get('last_name', '')}\".strip()\n" +
      "    return result\n",
  },
  {
    title: "Filter rows",
    description: "Function: transform(result, params=None). Input: result (list of dicts). Output: list with only rows where is_active is true.",
    code:
      "def transform(result, params=None):\n" +
      "    if isinstance(result, list):\n" +
      "        return [r for r in result if r.get(\"is_active\", True)]\n" +
      "    return result\n",
  },
  {
    title: "Paginate in transform",
    description: "Function: transform(result, params=None). Input: result (list), params (limit, offset). Output: result[offset:offset+limit].",
    code:
      "def transform(result, params=None):\n" +
      "    p = params or {}\n" +
      "    limit = int(p.get(\"limit\", 10))\n" +
      "    offset = int(p.get(\"offset\", 0))\n" +
      "    if isinstance(result, list):\n" +
      "        return result[offset : offset + limit]\n" +
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
            Function: transform(result, params=None). Input: result (raw executor output: list of dicts or single dict), params (request params dict). Output: transformed value returned as API response body.
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
