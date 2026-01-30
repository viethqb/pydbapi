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

const SQL_EXAMPLES: Example[] = [
  {
    title: "SQL – Output values (safe quoting via filters)",
    description:
      "Structure: Jinja2 SELECT. Input: col1, col2, col3 (params). Output: one row. Use sql_string, sql_int to avoid injection.",
    code:
      "SELECT\n" +
      "  {{ col1 | sql_string }} AS col1,\n" +
      "  {{ col2 | sql_string }} AS col2,\n" +
      "  {{ col3 | sql_int }} AS col3;",
  },
  {
    title: "SQL – Dynamic WHERE + IN list",
    description:
      "Structure: Jinja2 SELECT with {% where %}. Input: ids, name, status, limit, offset (params). Output: rows; in_list for IN (...), sql_like for ILIKE.",
    code:
      "SELECT id, name, status\n" +
      "FROM users\n" +
      "{% where %}\n" +
      "  {% if ids %}id IN {{ ids | in_list }}{% endif %}\n" +
      "  {% if name %}AND name ILIKE {{ name | sql_like }}{% endif %}\n" +
      "  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}\n" +
      "{% endwhere %}\n" +
      "ORDER BY id DESC\n" +
      "LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};",
  },
  {
    title: "SQL – Single row by ID",
    description: "Structure: Jinja2 SELECT WHERE. Input: id (param). Output: single row or empty. Use sql_int for numeric IDs.",
    code:
      "SELECT id, name, email, created_at\n" +
      "FROM users\n" +
      "WHERE id = {{ id | sql_int }};",
  },
  {
    title: "SQL – Conditional JOIN",
    description: "Structure: Jinja2 SELECT with {% if %} JOIN. Input: include_profile (param). Output: user rows; profile columns only if include_profile is true.",
    code:
      "SELECT u.id, u.name, p.title AS profile_title\n" +
      "FROM users u\n" +
      "{% if include_profile %}\n" +
      "LEFT JOIN profiles p ON p.user_id = u.id\n" +
      "{% endif %}\n" +
      "WHERE u.is_active = TRUE;",
  },
  {
    title: "SQL – Pagination + ordering",
    description: "Structure: Jinja2 SELECT with {% where %}. Input: q, limit, offset (params). Output: rows filtered, ordered, sliced.",
    code:
      "SELECT id, name, status\n" +
      "FROM items\n" +
      "{% where %}\n" +
      "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
      "{% endwhere %}\n" +
      "ORDER BY created_at DESC\n" +
      "LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};",
  },
]

const SCRIPT_EXAMPLES: Example[] = [
  {
    title: "Script – Lookup by ID",
    description:
      "Structure: req.get, db.query_one; assign result. Input: user_id (param). Output: result = {\"user\": row} or {\"error\": \"...\"}.",
    code:
      "user_id = req.get(\"user_id\")\n" +
      "if not user_id:\n" +
      "    result = {\"error\": \"user_id is required\"}\n" +
      "else:\n" +
      "    row = db.query_one(\n" +
      "        \"SELECT id, name, email FROM users WHERE id = %s\",\n" +
      "        (user_id,),\n" +
      "    )\n" +
      "    result = {\"user\": row} if row else {\"error\": \"Not found\"}",
  },
  {
    title: "Script – List + filter",
    description: "Structure: req.get, db.query; assign result. Input: min_age (param, default 18). Output: result = {\"total\": n, \"users\": rows}.",
    code:
      "min_age = req.get(\"min_age\", 18)\n" +
      "users = db.query(\n" +
      "    \"SELECT id, name, age FROM users WHERE age >= %s\",\n" +
      "    (min_age,),\n" +
      ")\n" +
      "result = {\"total\": len(users), \"users\": users}",
  },
  {
    title: "Script – Transaction (DML)",
    description: "Structure: tx.begin/commit/rollback, db.execute; assign result. Input: status, user_id (params). Output: result = {\"updated\": rc} or {\"error\": str}.",
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
      "    result = {\"error\": str(e)}",
  },
  {
    title: "Script – Cache read-through",
    description: "Structure: cache.get/set, db.query_one; assign result. Input: user_id (param). Output: result = user dict or {\"error\": \"Not found\"}.",
    code:
      "key = f\"user_{req.get('user_id')}\"\n" +
      "cached = cache.get(key)\n" +
      "if cached:\n" +
      "    result = cached\n" +
      "else:\n" +
      "    user = db.query_one(\"SELECT * FROM users WHERE id = %s\", (req.get(\"user_id\"),))\n" +
      "    if user:\n" +
      "        cache.set(key, user, ttl=300)\n" +
      "    result = user if user else {\"error\": \"Not found\"}",
  },
]

export default function ApiContentExamples({ executeEngine }: Props) {
  const [open, setOpen] = useState(false)

  const contentExamples = useMemo<Example[]>(
    () => (executeEngine === "SQL" ? SQL_EXAMPLES : SCRIPT_EXAMPLES),
    [executeEngine],
  )

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
            {executeEngine === "SQL"
              ? "Structure: Jinja2 template; params (dict) as variables. Input: params. Output: SQL query result (list of rows). Use {{ param | filter }}, {% where %}, {% if %}."
              : "Structure: Python script; params via req.get(), globals: db, tx, cache; assign result. Input: params (req.get). Output: result (dict/list) — returned after optional transform."}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">
          {contentExamples.map((ex) => (
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
