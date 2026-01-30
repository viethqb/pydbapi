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
    title: "Script – Simple query (default)",
    description:
      "result has success, message, data. Append to result[\"data\"], optionally result[\"total\"], return result.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      '    sql = "SELECT 1 AS col"\n' +
      "    rows = db.query(sql)\n" +
      '    result["data"].append(rows)\n' +
      "    return result\n",
  },
  {
    title: "Script – Lookup by ID",
    description:
      "Function: execute(params=None). params.get(\"user_id\"), db.query_one; return {\"user\": row} or {\"error\": \"...\"}.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      '    user_id = params.get("user_id")\n' +
      '    if not user_id:\n' +
      '        return {"error": "user_id is required"}\n' +
      "    row = db.query_one(\n" +
      '        "SELECT id, name, email FROM users WHERE id = %s",\n' +
      "        (user_id,),\n" +
      "    )\n" +
      '    return {"user": row} if row else {"error": "Not found"}\n',
  },
  {
    title: "Script – 2 SQL queries (like SQL mode)",
    description:
      "Append each query result to result[\"data\"]; add result[\"total\"]; return result.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      '    result["data"].append(db.query("SELECT id, name FROM users LIMIT 10"))\n' +
      '    count_row = db.query_one("SELECT COUNT(*) AS total FROM users")\n' +
      "    result[\"total\"] = count_row[\"total\"] if count_row else 0\n" +
      "    return result\n",
  },
  {
    title: "Script – List + filter",
    description:
      "Function: execute(params=None). params.get(\"min_age\", 18), db.query; return {\"total\": n, \"users\": rows}.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      '    min_age = params.get("min_age", 18)\n' +
      "    users = db.query(\n" +
      '        "SELECT id, name, age FROM users WHERE age >= %s",\n' +
      "        (min_age,),\n" +
      "    )\n" +
      '    return {"total": len(users), "users": users}\n',
  },
  {
    title: "Script – Transaction (DML)",
    description:
      "Function: execute(params=None). tx.begin/commit/rollback, db.execute; return {\"updated\": rc} or {\"error\": str}.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      "    tx.begin()\n" +
      "    try:\n" +
      "        rc = db.execute(\n" +
      '            "UPDATE users SET status = %s WHERE id = %s",\n' +
      "            (params.get(\"status\", 1), params.get(\"user_id\")),\n" +
      "        )\n" +
      "        tx.commit()\n" +
      '        return {"updated": rc}\n' +
      "    except Exception as e:\n" +
      "        tx.rollback()\n" +
      '        return {"error": str(e)}\n',
  },
  {
    title: "Script – Cache read-through",
    description:
      "Function: execute(params=None). cache.get/set, db.query_one; return user dict or {\"error\": \"Not found\"}.",
    code:
      "def execute(params=None):\n" +
      "    params = params or {}\n" +
      '    key = f"user_{params.get(\'user_id\')}"\n' +
      "    cached = cache.get(key)\n" +
      "    if cached:\n" +
      "        return cached\n" +
      '    user = db.query_one("SELECT * FROM users WHERE id = %s", (params.get("user_id"),))\n' +
      "    if user:\n" +
      "        cache.set(key, user, ttl=300)\n" +
      '    return user if user else {"error": "Not found"}\n',
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
              : "Structure: def execute(params=None): ... return result. Params from request; globals: db, tx, cache, req. Return dict/list — returned after optional transform."}
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
