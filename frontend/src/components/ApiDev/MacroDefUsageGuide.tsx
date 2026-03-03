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

const JINJA_PAGINATION =
  "{% macro paginate(limit, offset) %}\n" +
  "LIMIT {{ limit }} OFFSET {{ offset }}\n" +
  "{% endmacro %}"

const JINJA_SEARCH_FILTER =
  "{% macro search_filter(column, value) %}\n" +
  "{% if value %}AND {{ column }} ILIKE {{ value | sql_like }}{% endif %}\n" +
  "{% endmacro %}"

const JINJA_DATE_RANGE =
  "{% macro date_range(column, start, end) %}\n" +
  "{% if start %}AND {{ column }} >= {{ start | sql_date }}{% endif %}\n" +
  "{% if end %}AND {{ column }} <= {{ end | sql_date }}{% endif %}\n" +
  "{% endmacro %}"

const JINJA_USAGE =
  "{% set lim = (limit if limit is defined else 20) | sql_int %}\n" +
  "{% set off = (offset if offset is defined else 0) | sql_int %}\n\n" +
  "SELECT id, name, created_at\n" +
  "FROM users\n" +
  "{% where %}\n" +
  "  {{ search_filter('name', q) }}\n" +
  "  {{ date_range('created_at', start_date, end_date) }}\n" +
  "{% endwhere %}\n" +
  "ORDER BY created_at DESC\n" +
  "{{ paginate(lim, off) }};"

const PYTHON_HELPERS =
  "def safe_int(val, default=0):\n" +
  '    """Safely convert to int with fallback."""\n' +
  "    try:\n" +
  "        return int(val) if val is not None else default\n" +
  "    except (TypeError, ValueError):\n" +
  "        return default\n\n" +
  "def safe_float(val, default=0.0):\n" +
  '    """Safely convert to float with fallback."""\n' +
  "    try:\n" +
  "        return float(val) if val is not None else default\n" +
  "    except (TypeError, ValueError):\n" +
  "        return default\n\n" +
  "def is_valid_email(s):\n" +
  '    """Basic email validation."""\n' +
  '    return bool(s and isinstance(s, str) and "@" in s and "." in s)'

const PYTHON_HTTP_HELPER =
  "def fetch_json(url, params=None):\n" +
  '    """Fetch JSON from an external API."""\n' +
  "    resp = http.get(url, params=params)\n" +
  "    return resp if isinstance(resp, (dict, list)) else {}\n\n" +
  "def post_json(url, data):\n" +
  '    """POST JSON to an external API."""\n' +
  "    return http.post(url, json=data)\n\n" +
  "def cached_fetch(key, url, ttl=300):\n" +
  '    """Fetch with cache-aside pattern."""\n' +
  "    cached = cache.get(key)\n" +
  "    if cached is not None:\n" +
  "        return cached\n" +
  "    data = fetch_json(url)\n" +
  "    cache.set(key, data, ttl_seconds=ttl)\n" +
  "    return data"

const PYTHON_SCRIPT_USAGE =
  "# Macro functions (safe_int, fetch_json, etc.) are auto-prepended\n\n" +
  "def execute(params=None):\n" +
  "    params = params or {}\n" +
  '    limit = safe_int(params.get("limit"), 20)\n' +
  '    offset = safe_int(params.get("offset"), 0)\n\n' +
  "    # Use http helper from macro\n" +
  '    config = fetch_json("https://api.example.com/config")\n' +
  '    user_type = config.get("default_type", "standard")\n\n' +
  "    rows = db.query(\n" +
  '        "SELECT * FROM users WHERE type = %s LIMIT %s OFFSET %s",\n' +
  "        (user_type, limit, offset)\n" +
  "    )\n" +
  '    return {"data": rows, "config": config}'

const PYTHON_VALIDATE_USAGE =
  "# Macro functions are also available in parameter validate scripts.\n" +
  "# Example: validate email param using is_valid_email from macro.\n\n" +
  "def validate(value, params=None):\n" +
  "    if value is None:\n" +
  "        return True  # optional param\n" +
  "    return is_valid_email(value)"

const PYTHON_TRANSFORM_USAGE =
  "# Macro functions are also available in result transform scripts.\n" +
  "# Example: use safe_int from macro to normalize pagination.\n\n" +
  "def transform(result, params=None):\n" +
  "    p = params or {}\n" +
  '    result["offset"] = safe_int(p.get("offset"), 0)\n' +
  '    result["limit"] = safe_int(p.get("limit"), 20)\n' +
  '    result["total"] = len(result.get("data", []))\n' +
  "    return result"

export default function MacroDefUsageGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Macro Definition Guide</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Macros are reusable code snippets shared across all APIs in the{" "}
          <strong className="text-foreground">same module</strong>. Define them
          once, use them in any API within that module.
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
          <li>
            <strong className="text-foreground">Jinja macros</strong> —
            prepended to SQL template content. Define reusable SQL fragments
            with{" "}
            <code className="rounded bg-muted px-1">{`{% macro name(args) %} ... {% endmacro %}`}</code>
            .
          </li>
          <li>
            <strong className="text-foreground">Python macros</strong> —
            prepended to script content, parameter validation scripts, and
            result transform scripts. Define helper functions that are callable
            directly.
          </li>
          <li>
            <strong className="text-foreground">Scope</strong> — macros are
            available to all APIs in the same module but not across modules.
            Multiple macros in a module are joined together.
          </li>
          <li>
            <strong className="text-foreground">Versioning</strong> — macros
            have their own version commits, independent of API versions.
          </li>
        </ul>
      </div>

      <Tabs defaultValue="jinja" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="jinja">Jinja Macros</TabsTrigger>
          <TabsTrigger value="python">Python Macros</TabsTrigger>
        </TabsList>

        <TabsContent value="jinja" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Jinja macros define reusable SQL fragments. Use{" "}
            <code className="rounded bg-muted px-1">{`{% macro name(args) %} ... {% endmacro %}`}</code>{" "}
            in the macro definition, then call with{" "}
            <code className="rounded bg-muted px-1">{`{{ name(args) }}`}</code>{" "}
            in any SQL API content within the same module.
          </p>
          <CopyableBlock
            title="1. Pagination Macro"
            description="Reusable LIMIT/OFFSET block"
            content={JINJA_PAGINATION}
            defaultOpen
          />
          <CopyableBlock
            title="2. Search Filter Macro"
            description="Conditional ILIKE filter for any column"
            content={JINJA_SEARCH_FILTER}
            defaultOpen
          />
          <CopyableBlock
            title="3. Date Range Macro"
            description="Conditional date range filter"
            content={JINJA_DATE_RANGE}
          />
          <CopyableBlock
            title="4. Usage in SQL API Content"
            description="Call macros by name. Assign filtered values with {% set %} first."
            content={JINJA_USAGE}
            defaultOpen
          />
        </TabsContent>

        <TabsContent value="python" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Python macros define helper functions. They are auto-prepended to
            script content, parameter validation scripts, and result transform
            scripts within the same module. Functions can use{" "}
            <code className="rounded bg-muted px-1">db</code>,{" "}
            <code className="rounded bg-muted px-1">http</code>,{" "}
            <code className="rounded bg-muted px-1">cache</code>,{" "}
            <code className="rounded bg-muted px-1">req</code> — all context
            objects are in scope.
          </p>
          <CopyableBlock
            title="1. Type Conversion & Validation Helpers"
            description="Pure functions: safe_int, safe_float, is_valid_email. Work everywhere."
            content={PYTHON_HELPERS}
            defaultOpen
          />
          <CopyableBlock
            title="2. HTTP Helpers"
            description="Functions that use http context. Available in script content."
            content={PYTHON_HTTP_HELPER}
            defaultOpen
          />
          <CopyableBlock
            title="3. Usage in Script API Content"
            description="Call macro functions directly. They are auto-prepended to your script."
            content={PYTHON_SCRIPT_USAGE}
            defaultOpen
          />
          <CopyableBlock
            title="4. Usage in Parameter Validation"
            description="Macro helpers are also available in validate scripts."
            content={PYTHON_VALIDATE_USAGE}
          />
          <CopyableBlock
            title="5. Usage in Result Transform"
            description="Macro helpers are also available in transform scripts."
            content={PYTHON_TRANSFORM_USAGE}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
