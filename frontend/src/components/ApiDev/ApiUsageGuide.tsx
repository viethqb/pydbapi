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
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
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

const PARAMS_DEFINITION =
  "Define parameters in Basic Info \u2192 Parameters:\n\n" +
  "  Name         Location  Type     Required  Default  Description\n" +
  "  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n" +
  "  limit        query     integer  no        20       Page size\n" +
  "  offset       query     integer  no        0        Page offset\n" +
  "  q            query     string   no                 Search text\n" +
  "  status       query     integer  no                 Filter by status\n" +
  "  active       query     boolean  no                 Filter by active\n" +
  "  ids          query     array    no                 Filter by ID list\n" +
  '  filters      body      object   no                 e.g. {"min": 1, "max": 100}\n' +
  "  X-User-Id    header    string   no                 Custom header param\n\n" +
  "Supported types: string, integer, number, boolean, array, object.\n" +
  "The gateway coerces HTTP input to these types before passing to SQL/Python."

const PARAM_VALIDATION =
  "Define in Basic Info \u2192 Parameter validate (optional).\n" +
  "Each validation is a Python function per parameter:\n\n" +
  "  def validate(value, params=None):\n" +
  "      return True  # or False\n\n" +
  "Example \u2014 numeric range (for 'limit'):\n\n" +
  "  def validate(value, params=None):\n" +
  "      try:\n" +
  "          n = int(value) if value is not None else None\n" +
  "          if n is None:\n" +
  "              return False\n" +
  "          return 1 <= n <= 1000\n" +
  "      except (TypeError, ValueError):\n" +
  "          return False\n\n" +
  "Example \u2014 string max length (for 'q'):\n\n" +
  "  def validate(value, params=None):\n" +
  "      if value is None:\n" +
  "          return True\n" +
  "      return len(str(value)) <= 255\n\n" +
  "Runs as RestrictedPython. Return False \u2192 400 with message_when_fail."

const SQL_CONTENT =
  "SELECT id, name, status, price, created_at\n" +
  "FROM items\n" +
  "{% where %}\n" +
  "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
  "  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}\n" +
  "  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}\n" +
  "  {% if ids %}AND id IN {{ ids | in_list }}{% endif %}\n" +
  "  {% if filters and filters.min is defined %}AND price >= {{ filters.min | sql_float }}{% endif %}\n" +
  "  {% if filters and filters.max is defined %}AND price <= {{ filters.max | sql_float }}{% endif %}\n" +
  "{% endwhere %}\n" +
  "ORDER BY created_at DESC\n" +
  "LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};"

const SQL_COUNT =
  "SELECT COUNT(*) AS total\n" +
  "FROM items\n" +
  "{% where %}\n" +
  "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
  "  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}\n" +
  "  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}\n" +
  "  {% if ids %}AND id IN {{ ids | in_list }}{% endif %}\n" +
  "  {% if filters and filters.min is defined %}AND price >= {{ filters.min | sql_float }}{% endif %}\n" +
  "  {% if filters and filters.max is defined %}AND price <= {{ filters.max | sql_float }}{% endif %}\n" +
  "{% endwhere %};"

const SQL_OBJECT_PARAM =
  "Object parameters (type: object) are passed as dicts.\n" +
  "Access nested keys in Jinja2 with dot notation:\n\n" +
  "  Parameter: filters (body, object)\n" +
  '  Example value: {"min": 10, "max": 100}\n\n' +
  "  In SQL template:\n" +
  "  {% if filters and filters.min is defined %}\n" +
  "    AND price >= {{ filters.min | sql_float }}\n" +
  "  {% endif %}\n" +
  "  {% if filters and filters.max is defined %}\n" +
  "    AND price <= {{ filters.max | sql_float }}\n" +
  "  {% endif %}\n\n" +
  "  Nested objects also work:\n" +
  '  Value: {"range": {"low": 0, "high": 99}}\n' +
  "  Access: filters.range.low, filters.range.high"

const RESULT_TRANSFORM =
  "def transform(result, params=None):\n" +
  '    """Normalize to { data, message, total, offset, limit }"""\n' +
  "    p = params or {}\n" +
  '    limit = int(p.get("limit", 20))\n' +
  '    offset = int(p.get("offset", 0))\n' +
  '    d = result.get("data", [])\n\n' +
  "    # Multi-statement SQL returns [[rows], [{total}]]\n" +
  "    if isinstance(d, list) and len(d) >= 2:\n" +
  "        rows = d[0] if isinstance(d[0], list) else d[0]\n" +
  '        total_val = d[1][0].get("total", len(rows)) if d[1] else len(rows)\n' +
  '        result["data"] = rows\n' +
  '        result["total"] = total_val\n' +
  "    else:\n" +
  "        rows = d[0] if isinstance(d, list) and d and isinstance(d[0], list) else d\n" +
  '        result["data"] = rows if isinstance(rows, list) else []\n' +
  '        result["total"] = len(result["data"])\n\n' +
  '    result["message"] = None\n' +
  '    result["offset"] = offset\n' +
  '    result["limit"] = limit\n' +
  "    return result"

const PYTHON_CONTENT =
  "def execute(params=None):\n" +
  "    params = params or {}\n" +
  '    limit = int(params.get("limit", 20))\n' +
  '    offset = int(params.get("offset", 0))\n' +
  '    q = params.get("q", "").strip()\n' +
  '    status = params.get("status")\n' +
  '    filters = params.get("filters") or {}\n' +
  '    price_min = filters.get("min") if isinstance(filters, dict) else None\n' +
  '    price_max = filters.get("max") if isinstance(filters, dict) else None\n\n' +
  '    where = "WHERE 1=1"\n' +
  "    args = []\n\n" +
  "    if q:\n" +
  '        where += " AND name ILIKE %s"\n' +
  '        args.append(f"%{q}%")\n' +
  "    if status is not None:\n" +
  '        where += " AND status = %s"\n' +
  "        args.append(status)\n" +
  "    if price_min is not None:\n" +
  '        where += " AND price >= %s"\n' +
  "        args.append(price_min)\n" +
  "    if price_max is not None:\n" +
  '        where += " AND price <= %s"\n' +
  "        args.append(price_max)\n\n" +
  '    total_row = db.query_one(f"SELECT COUNT(*) AS total FROM items {where}", tuple(args))\n' +
  '    total = total_row["total"] if total_row else 0\n\n' +
  "    rows = db.query(\n" +
  '        f"SELECT id, name, status, price, created_at FROM items {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",\n' +
  "        tuple(args + [limit, offset])\n" +
  "    )\n\n" +
  '    return {"data": rows, "total": total, "offset": offset, "limit": limit}'

export default function ApiUsageGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">API Create & Edit Guide</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Step-by-step: define parameters, write content (SQL or Python), add
          validation, and optionally transform results. Standard response:{" "}
          <code className="rounded bg-muted px-1">
            {"{ success, data, message, total, offset, limit }"}
          </code>
          .
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          <strong className="text-foreground">Tip:</strong> Use the{" "}
          <strong className="text-foreground">Debug</strong> tab to test your
          API with sample parameters before publishing. For SQL, it also shows
          the rendered query.
        </p>
      </div>

      <Tabs defaultValue="sql" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sql">SQL (Jinja2)</TabsTrigger>
          <TabsTrigger value="python">Python Script</TabsTrigger>
        </TabsList>

        <TabsContent value="sql" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            SQL API with dynamic filtering (string, integer, boolean, array,
            object params), pagination, count, and result transform. Use{" "}
            <code className="rounded bg-muted px-1">{";"}</code> to separate
            multiple statements (e.g. data + count). Add{" "}
            <code className="rounded bg-muted px-1">?naming=camel</code> to
            convert response keys to camelCase.
          </p>
          <CopyableBlock
            title="1. Parameters"
            description="Define in Basic Info \u2192 Parameters. Types are coerced before reaching your SQL."
            content={PARAMS_DEFINITION}
            defaultOpen
          />
          <CopyableBlock
            title="2. Parameter Validation (optional)"
            description="Python function per parameter. Returns True/False."
            content={PARAM_VALIDATION}
          />
          <CopyableBlock
            title="3. SQL Content \u2014 Main Query"
            description="Uses {% where %}, sql_like, sql_int, sql_bool, in_list, sql_float for object params."
            content={SQL_CONTENT}
            defaultOpen
          />
          <CopyableBlock
            title="4. SQL Content \u2014 Count Query (second statement)"
            description="Same WHERE conditions. Multi-statement SQL returns [[rows], [{total}]]."
            content={SQL_COUNT}
          />
          <CopyableBlock
            title="5. Object Parameters in SQL"
            description="Access object keys with dot notation: filters.min, filters.max."
            content={SQL_OBJECT_PARAM}
          />
          <CopyableBlock
            title="6. Result Transform (optional)"
            description="Python function to normalize multi-statement results into { data, total, offset, limit }."
            content={RESULT_TRANSFORM}
          />
        </TabsContent>

        <TabsContent value="python" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Python API with the same filtering and pagination logic. Uses{" "}
            <code className="rounded bg-muted px-1">db.query</code> /{" "}
            <code className="rounded bg-muted px-1">db.query_one</code> with{" "}
            <code className="rounded bg-muted px-1">%s</code> placeholders. No
            result transform needed — the script returns the final shape
            directly via{" "}
            <code className="rounded bg-muted px-1">def execute(params)</code>{" "}
            or the global <code className="rounded bg-muted px-1">result</code>{" "}
            variable.
          </p>
          <CopyableBlock
            title="1. Parameters"
            description="Same as SQL: define types, defaults, and validation in Basic Info."
            content={PARAMS_DEFINITION}
            defaultOpen
          />
          <CopyableBlock
            title="2. Parameter Validation (optional)"
            description="Same validation functions work for both SQL and Python APIs."
            content={PARAM_VALIDATION}
          />
          <CopyableBlock
            title="3. Python Script Content"
            description="execute(params) builds WHERE clause, queries count + rows, returns { data, total, offset, limit }."
            content={PYTHON_CONTENT}
            defaultOpen
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
