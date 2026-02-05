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

const EXAMPLE1_PARAMS =
  "Add parameters in Basic Info → Parameters:\n\n" +
  "  • limit      (query,  integer, required=false, default=10)\n" +
  "  • offset     (query,  integer, required=false, default=0)\n" +
  "  • q          (query,  string,  required=false) — search text\n" +
  "  • status     (query,  integer, required=false) — filter by status\n" +
  "  • active     (query,  boolean, required=false)\n" +
  "  • ids        (query,  array,   required=false) — e.g. [1,2,3]\n" +
  "  • filters    (body,   object,  required=false) — e.g. {\"min\": 1, \"max\": 100}\n" +
  "  • X-User-Id  (header, string,  required=false)\n\n" +
  "Data types: string, integer, number, boolean, array, object. DBAPI converts HTTP input to these types before passing to SQL/Python."

const EXAMPLE1_VALIDATION =
  "Add in Basic Info → Parameter validate. validate(value, params=None) runs per parameter; return True/False.\n\n" +
  "Example – numeric range (e.g. for param 'limit'):\n" +
  "def validate(value, params=None):\n" +
  "    try:\n" +
  "        n = int(value) if value is not None else None\n" +
  "        if n is None:\n" +
  "            return False\n" +
  "        return 1 <= n <= 1000\n" +
  "    except (TypeError, ValueError):\n" +
  "        return False\n\n" +
  "Example – string length (e.g. for param 'q'):\n" +
  "def validate(value, params=None):\n" +
  "    if value is None:\n" +
  "        return True\n" +
  "    s = str(value)\n" +
  "    return len(s) <= 255\n\n" +
  "Example – always pass (minimal):\n" +
  "def validate(value, params=None):\n" +
  '    return True\n'

const EXAMPLE1_SQL =
  "SELECT id, name, status, created_at\n" +
  "FROM items\n" +
  "{% where %}\n" +
  "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
  "  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}\n" +
  "  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}\n" +
  "  {% if ids %}AND id IN {{ ids | in_list }}{% endif %}\n" +
  "  {# Object param: filters = { \"min\", \"max\" } from body #}\n" +
  "  {% if filters and filters.min is defined %}AND price >= {{ filters.min | sql_int }}{% endif %}\n" +
  "  {% if filters and filters.max is defined %}AND price <= {{ filters.max | sql_int }}{% endif %}\n" +
  "{% endwhere %}\n" +
  "ORDER BY created_at DESC\n" +
  "LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};"

const EXAMPLE1_SQL_OBJECT_PARAM =
  "Using object param in Jinja: param 'filters' (body, object) e.g. {\"min\": 1, \"max\": 100}.\n\n" +
  "Access by key: filters.min, filters.max (or filters['min']). Use sql_int/sql_float for numbers.\n\n" +
  "  {% if filters and filters.min is defined %}AND price >= {{ filters.min | sql_int }}{% endif %}\n" +
  "  {% if filters and filters.max is defined %}AND price <= {{ filters.max | sql_int }}{% endif %}\n\n" +
  "Optional nested keys: filters.range.low, filters.range.high if client sends {\"range\": {\"low\": 0, \"high\": 99}}."

const EXAMPLE1_SQL_COUNT =
  "SELECT COUNT(*) AS total\n" +
  "FROM items\n" +
  "{% where %}\n" +
  "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
  "  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}\n" +
  "  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}\n" +
  "  {% if ids %}AND id IN {{ ids | in_list }}{% endif %}\n" +
  "  {% if filters and filters.min is defined %}AND price >= {{ filters.min | sql_int }}{% endif %}\n" +
  "  {% if filters and filters.max is defined %}AND price <= {{ filters.max | sql_int }}{% endif %}\n" +
  "{% endwhere %};"

const EXAMPLE1_RESULT_TRANSFORM =
  "def transform(result, params=None):\n" +
  '    """Normalize response to { data: [], message: null, total, offset, limit }"""\n' +
  "    p = params or {}\n" +
  "    limit = int(p.get(\"limit\", 10))\n" +
  "    offset = int(p.get(\"offset\", 0))\n" +
  "    d = result.get(\"data\", [])\n" +
  "    # SQL 2 statement: d = [[rows], [{total}]]\n" +
  "    if isinstance(d, list) and len(d) >= 2:\n" +
  "        rows = d[0] if isinstance(d[0], list) else d[0]\n" +
  "        total_val = d[1][0].get(\"total\", len(rows)) if d[1] else len(rows)\n" +
  "        result[\"data\"] = rows\n" +
  "        result[\"total\"] = total_val\n" +
  "    else:\n" +
  "        result[\"data\"] = d[0] if isinstance(d, list) and d and isinstance(d[0], list) else (d if isinstance(d, list) else [])\n" +
  "        result[\"total\"] = len(result[\"data\"])\n" +
  "    result[\"message\"] = None\n" +
  "    result[\"offset\"] = offset\n" +
  "    result[\"limit\"] = limit\n" +
  "    return result"

const EXAMPLE2_PYTHON =
  "def execute(params=None):\n" +
  "    params = params or {}\n" +
  "    limit = int(params.get(\"limit\", 10))\n" +
  "    offset = int(params.get(\"offset\", 0))\n" +
  "    q = params.get(\"q\", \"\").strip()\n" +
  "    status = params.get(\"status\")\n" +
  "    filters = params.get(\"filters\") or {}  # object param from body\n" +
  "    price_min = filters.get(\"min\") if isinstance(filters, dict) else None\n" +
  "    price_max = filters.get(\"max\") if isinstance(filters, dict) else None\n" +
  "    \n" +
  "    where_clause = \"WHERE 1=1\"\n" +
  "    args = []\n" +
  "    if q:\n" +
  "        where_clause += \" AND name ILIKE %s\"\n" +
  "        args.append(f\"%{q}%\")\n" +
  "    if status is not None:\n" +
  "        where_clause += \" AND status = %s\"\n" +
  "        args.append(status)\n" +
  "    if price_min is not None:\n" +
  "        where_clause += \" AND price >= %s\"\n" +
  "        args.append(price_min)\n" +
  "    if price_max is not None:\n" +
  "        where_clause += \" AND price <= %s\"\n" +
  "        args.append(price_max)\n" +
  "    \n" +
  "    count_sql = f\"SELECT COUNT(*) AS total FROM items {where_clause}\"\n" +
  "    total_row = db.query_one(count_sql, tuple(args))\n" +
  "    total = total_row[\"total\"] if total_row else 0\n" +
  "    \n" +
  "    data_sql = f\"SELECT id, name, status, created_at FROM items {where_clause} ORDER BY created_at DESC LIMIT %s OFFSET %s\"\n" +
  "    args.extend([limit, offset])\n" +
  "    rows = db.query(data_sql, tuple(args))\n" +
  "    \n" +
  "    result[\"data\"] = rows\n" +
  "    result[\"total\"] = total\n" +
  "    result[\"offset\"] = offset\n" +
  "    result[\"limit\"] = limit\n" +
  "    result[\"message\"] = None\n" +
  "    return result"

export default function ApiUsageGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">API create &amp; edit guide</h2>
        <p className="text-sm text-muted-foreground mt-1">
          End-to-end: Parameters, Content (SQL/Python), Result transform. Standard response shape{" "}
          <code className="rounded bg-muted px-1">{"{ data, message, total, offset, limit }"}</code>.
        </p>
      </div>

      <Tabs defaultValue="example1" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="example1">Example 1: SQL (Jinja)</TabsTrigger>
          <TabsTrigger value="example2">Example 2: Python</TabsTrigger>
        </TabsList>

        <TabsContent value="example1" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            SQL (Jinja2) API: filters for all data types (string, number, boolean, array, object), paging with limit/offset, result transform to{" "}
            <code className="rounded bg-muted px-1">{"{ data, message: null, total, offset, limit }"}</code>.
          </p>
          <CopyableBlock
            title="1. Parameters (Basic Info → Parameters)"
            description="Define params: limit, offset, q, status, active, ids, filters (object), header..."
            content={EXAMPLE1_PARAMS}
          />
          <CopyableBlock
            title="1b. Parameter validation (Basic Info → Parameter validate)"
            description="validate(value, params=None) → True/False per parameter; optional."
            content={EXAMPLE1_VALIDATION}
          />
          <CopyableBlock
            title="2. SQL (Jinja) – Main query + paging + object param"
            description="Use {% where %}, sql_like, sql_int, sql_bool, in_list, and filters.min / filters.max"
            content={EXAMPLE1_SQL}
          />
          <CopyableBlock
            title="2b. Using object param in SQL (Jinja)"
            description="Access object keys: filters.min, filters.max; use sql_int/sql_float for numbers"
            content={EXAMPLE1_SQL_OBJECT_PARAM}
          />
          <CopyableBlock
            title="3. SQL – Count (second statement)"
            description="Same WHERE conditions for total; 2 statements → raw result = [[rows], [{total}]]"
            content={EXAMPLE1_SQL_COUNT}
          />
          <CopyableBlock
            title="4. Result transform (Python)"
            description="Normalize to { data, message: null, total, offset, limit }"
            content={EXAMPLE1_RESULT_TRANSFORM}
          />
        </TabsContent>

        <TabsContent value="example2" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Python (SCRIPT) API: execute(params) receives params, use db.query / db.query_one, return result with data, total, offset, limit, message.
          </p>
          <CopyableBlock
            title="Parameters"
            description="Same as Example 1: limit, offset, q, status, filters (object), etc."
            content={EXAMPLE1_PARAMS}
          />
          <CopyableBlock
            title="Parameter validation (optional)"
            description="validate(value, params=None) → True/False; same as Example 1."
            content={EXAMPLE1_VALIDATION}
          />
          <CopyableBlock
            title="Python script – execute(params)"
            description="Filter, paging, return { data, total, offset, limit, message: null }. Use params.get('filters') for object."
            content={EXAMPLE2_PYTHON}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
