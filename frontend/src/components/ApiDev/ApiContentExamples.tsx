import { Check, ChevronDown, Copy } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"

type Props = {
  executeEngine: "SQL" | "SCRIPT"
}

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

export default function ApiContentExamples({ executeEngine }: Props) {
  const [open, setOpen] = useState(true)

  const examples = useMemo<Example[]>(() => {
    if (executeEngine === "SQL") {
      return [
        {
          title: "SQL - Case 1: output values (safe quoting via filters)",
          description:
            "Use SQL filters to avoid treating strings as column names (and reduce injection risk).",
          code:
            "SELECT\n" +
            "  {{ col1 | sql_string }} AS col1,\n" +
            "  {{ col2 | sql_string }} AS col2,\n" +
            "  {{ col3 | sql_int }} AS col3;\n",
        },
        {
          title: "SQL - Case 2: dynamic WHERE / IN list",
          description:
            "Supports {% if %}, {% for %}, and custom {% where %} tag.",
          code:
            "SELECT id, name, status\n" +
            "FROM users\n" +
            "{% where %}\n" +
            "  {% if ids %}id IN {{ ids | in_list }}{% endif %}\n" +
            "  {% if name %}AND name ILIKE {{ name | sql_like }}{% endif %}\n" +
            "{% endwhere %}\n" +
            "ORDER BY id DESC\n" +
            "LIMIT {{ limit | sql_int }};\n",
        },
      ]
    }

    return [
      {
        title: "Python Script - Case 1: basic query",
        description:
          "Script must assign `result`. Use `req` for params and `db.query/query_one` for DB access.",
        code:
          "user_id = req.get(\"user_id\")\n" +
          "if not user_id:\n" +
          "    result = {\"error\": \"user_id is required\"}\n" +
          "else:\n" +
          "    user = db.query_one(\n" +
          "        \"SELECT id, name, email FROM users WHERE id = %s\",\n" +
          "        (user_id,),\n" +
          "    )\n" +
          "    result = {\"user\": user}\n",
      },
      {
        title: "Python Script - Case 2: transaction + DML",
        description:
          "Use `tx.begin/commit/rollback` to control transactions explicitly.",
        code:
          "tx.begin()\n" +
          "try:\n" +
          "    rc = db.execute(\n" +
          "        \"UPDATE users SET status = %s WHERE id = %s\",\n" +
          "        (req.get(\"status\", 1), req.get(\"user_id\")),\n" +
          "    )\n" +
          "    tx.commit()\n" +
          "    result = {\"updated\": rc}\n" +
          "except Exception as e:\n" +
          "    tx.rollback()\n" +
          "    result = {\"error\": str(e)}\n",
      },
    ]
  }, [executeEngine])

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <div className="text-sm font-medium">Content examples</div>
          <div className="text-xs text-muted-foreground">
            SQL (Jinja2) / Python Script templates you can copy & paste
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">
          {examples.map((ex) => (
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

