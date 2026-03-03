import { createFileRoute } from "@tanstack/react-router"
import { Code, Copy, Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const IF_CONDITIONS: Array<{ condition: string; meaning: string; example: string }> =
  [
    {
      condition: "{% if name is none %}",
      meaning: "Value is None",
      example: "{% if user_id is none %}",
    },
    {
      condition: "{% if name is not none %}",
      meaning: "Value is not None",
      example: "{% if user_id is not none %}",
    },
    {
      condition: "{% if name is defined %}",
      meaning: "Key exists in params",
      example: "{% if status is defined %}",
    },
    {
      condition: "{% if name is not defined %}",
      meaning: "Key does not exist",
      example: "{% if offset is not defined %}",
    },
    {
      condition: "{% if name %}",
      meaning: "Truthy (not None, not empty, not 0)",
      example: "{% if q %}",
    },
    {
      condition: "{% if name | length > 0 %}",
      meaning: "Non-empty sequence/string",
      example: "{% if ids is defined and ids | length > 0 %}",
    },
    {
      condition: "{% if name | trim != '' %}",
      meaning: "Non-blank string",
      example: "{% if q is defined and q | trim != '' %}",
    },
    {
      condition: "{% if a <= b %}",
      meaning: "Less-than-or-equal",
      example: "{% if page <= 10 %}",
    },
    {
      condition: "{% if a >= b %}",
      meaning: "Greater-than-or-equal",
      example: "{% if age >= 18 %}",
    },
    {
      condition: "{% if name is number %}",
      meaning: "Value is numeric",
      example: "{% if price is number %}",
    },
    {
      condition: "{% if name is string %}",
      meaning: "Value is a string",
      example: "{% if email is string %}",
    },
    {
      condition: "{% if name is mapping %}",
      meaning: "Value is a dict/mapping",
      example: "{% if payload is mapping %}",
    },
    {
      condition: "{% if name is iterable %}",
      meaning: "Value is iterable (list, tuple, etc.)",
      example: "{% if ids is iterable %}",
    },
    {
      condition: "{% if a is divisibleby n %}",
      meaning: "Divisible by n",
      example: "{% if limit is divisibleby 10 %}",
    },
  ]

const FILTERS: Array<{ name: string; description: string; example: string }> = [
  {
    name: "sql_string",
    description: "Escapes and single-quotes strings. None \u2192 NULL.",
    example: "{{ name | sql_string }}",
  },
  {
    name: "sql_int",
    description: "Validates and formats as integer. None \u2192 NULL.",
    example: "{{ age | sql_int }}",
  },
  {
    name: "sql_float",
    description: "Validates and formats as float. None \u2192 NULL.",
    example: "{{ price | sql_float }}",
  },
  {
    name: "sql_bool",
    description: "Converts to TRUE / FALSE. None \u2192 NULL.",
    example: "{{ is_active | sql_bool }}",
  },
  {
    name: "sql_date",
    description: "Formats as 'YYYY-MM-DD'. None \u2192 NULL.",
    example: "{{ start_date | sql_date }}",
  },
  {
    name: "sql_datetime",
    description: "Formats as ISO datetime string. None \u2192 NULL.",
    example: "{{ created_at | sql_datetime }}",
  },
  {
    name: "in_list",
    description: "Converts array to (1, 2, 3) for IN clauses. Empty \u2192 (SELECT 1 WHERE 1=0).",
    example: "{{ ids | in_list }}",
  },
  {
    name: "sql_like",
    description: "Escapes % and _ for LIKE patterns, wraps with %. None \u2192 NULL.",
    example: "{{ q | sql_like }}",
  },
  {
    name: "sql_like_start",
    description: "Prefix match: escapes input, adds trailing %.",
    example: "{{ q | sql_like_start }}",
  },
  {
    name: "sql_like_end",
    description: "Suffix match: escapes input, adds leading %.",
    example: "{{ q | sql_like_end }}",
  },
  {
    name: "json",
    description: "Serializes to JSON string for JSONB/JSON columns.",
    example: "{{ payload | json }}",
  },
]

export const Route = createFileRoute("/_layout/about/sql-jinja")({
  component: SqlJinjaGuide,
  head: () => ({
    meta: [
      {
        title: "SQL (Jinja2) Guide",
      },
    ],
  }),
})

function CodeBlock({ code, title }: { code: string; title?: string }) {
  const { showSuccessToast } = useCustomToast()
  const [copiedText, copy] = useCopyToClipboard()
  const isCopied = copiedText === code

  return (
    <div className="space-y-2">
      {title && <div className="text-sm font-medium">{title}</div>}
      <div className="relative">
        <pre className="p-4 bg-muted rounded-md overflow-auto text-sm leading-relaxed font-mono">
          {code}
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          onClick={async () => {
            const ok = await copy(code)
            if (ok) showSuccessToast("Code copied")
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
    </div>
  )
}

function SqlJinjaGuide() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            SQL with Jinja2 Templating
          </CardTitle>
          <CardDescription>
            Write dynamic, parameterized SQL queries using Jinja2 syntax with built-in SQL filters for safe value escaping
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Overview</h3>
            <p className="text-muted-foreground">
              The SQL engine renders your query as a Jinja2 template before executing it against the configured data source.
              Request parameters are passed as template variables.
              Always use SQL filters (<code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">sql_string</code>,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">sql_int</code>, etc.) to escape values safely
              — never output raw parameters with <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ param }}"}</code> alone.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Basic Syntax</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Output Variables</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ variable | filter }}"}</code> to output
                  parameter values with safe escaping:
                </p>
                <CodeBlock
                  code={`SELECT * FROM users WHERE id = {{ user_id | sql_int }};

-- String values
SELECT * FROM users WHERE name = {{ name | sql_string }};

-- Boolean values
SELECT * FROM users WHERE is_active = {{ active | sql_bool }};

-- IN clause with array
SELECT * FROM users WHERE id IN {{ ids | in_list }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">The {"{% where %}"} Tag</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  The custom <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% where %}"}</code> tag
                  automatically handles dynamic WHERE clauses:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc mb-3">
                  <li>Adds <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">WHERE</code> keyword only if at least one condition is present</li>
                  <li>Strips leading <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">AND</code> / <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">OR</code> from the first condition</li>
                  <li>Outputs nothing if all conditions are empty</li>
                </ul>
                <CodeBlock
                  code={`SELECT id, name, email, status
FROM users
{% where %}
  {% if ids %}id IN {{ ids | in_list }}{% endif %}
  {% if name %}AND name ILIKE {{ name | sql_like }}{% endif %}
  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}
  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}
{% endwhere %}
ORDER BY id DESC
LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Conditional Logic</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">If / Elif / Else</h4>
                <CodeBlock
                  code={`SELECT
  id,
  name,
  {% if sort_by == 'name' %}
    name AS sort_key
  {% elif sort_by == 'date' %}
    created_at AS sort_key
  {% else %}
    id AS sort_key
  {% endif %}
FROM users
WHERE is_active = TRUE
ORDER BY sort_key {{ 'DESC' if sort_desc else 'ASC' }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Conditional JOINs</h4>
                <CodeBlock
                  code={`SELECT u.id, u.name
  {% if include_profile %}, p.bio, p.avatar{% endif %}
  {% if include_orders %}, COUNT(o.id) AS order_count{% endif %}
FROM users u
{% if include_profile %}
LEFT JOIN profiles p ON p.user_id = u.id
{% endif %}
{% if include_orders %}
LEFT JOIN orders o ON o.user_id = u.id
{% endif %}
WHERE u.is_active = TRUE
{% if include_orders %}GROUP BY u.id, u.name{% if include_profile %}, p.bio, p.avatar{% endif %}{% endif %};`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Loops and Variables</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">For Loops</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  For fine-grained control over list output (when <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">in_list</code> is not enough):
                </p>
                <CodeBlock
                  code={`SELECT id, name
FROM users
WHERE id IN (
  {% for id in ids %}
    {{ id | sql_int }}{% if not loop.last %},{% endif %}
  {% endfor %}
);`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Set Variables</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Compute and reuse values with defaults:
                </p>
                <CodeBlock
                  code={`{% set lim = (limit if limit is defined else 50) | sql_int %}
{% set off = (offset if offset is defined else 0) | sql_int %}

SELECT id, name, created_at
FROM users
ORDER BY created_at DESC
LIMIT {{ lim }} OFFSET {{ off }};`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Condition Cheat Sheet</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Common patterns for use inside <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% if ... %}"}</code>:
            </p>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Condition</TableHead>
                    <TableHead className="w-[260px]">Meaning</TableHead>
                    <TableHead>Example</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {IF_CONDITIONS.map((row) => (
                    <TableRow key={row.condition}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {row.condition}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.meaning}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {row.example}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">SQL Filters Reference</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Filters escape and format values for safe SQL output. Always apply them to user-provided parameters.
            </p>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Filter</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[240px]">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FILTERS.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{f.name}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.description}</TableCell>
                      <TableCell className="font-mono text-sm">{f.example}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Multi-Statement SQL</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Separate multiple statements with <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">;</code>.
              Each SELECT returns its own result set. Common pattern: data query + count query.
            </p>
            <CodeBlock
              code={`{# Statement 1: fetch page of rows #}
SELECT id, name, status, price, created_at
FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}
  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};

{# Statement 2: total count (same WHERE) #}
SELECT COUNT(*) AS total
FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}
  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}
{% endwhere %};`}
            />
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Result structure:</strong> Multi-statement returns{" "}
                <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">{"[[rows...], [{total: N}]]"}</code>.
                Use a <strong>Result Transform</strong> to reshape into{" "}
                <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">{"{ data, total, offset, limit }"}</code>.
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Comments</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Use Jinja2 comments to document your templates. They are stripped during rendering and never reach the database:
            </p>
            <CodeBlock
              code={`{# This comment is removed during rendering #}
SELECT id, name FROM users
{# TODO: add soft-delete filter #}
WHERE is_active = TRUE;`}
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Full Example</h3>
            <p className="text-sm text-muted-foreground mb-2">
              A complete API query with search, filtering, object parameters, and pagination:
            </p>
            <CodeBlock
              code={`{# Parameters:
   q       (query, string)  - search text
   status  (query, integer) - filter by status
   active  (query, boolean) - filter by active flag
   ids     (query, array)   - filter by id list
   filters (body, object)   - e.g. {"min_price": 10, "max_price": 100}
   limit   (query, integer, default=20)
   offset  (query, integer, default=0)
#}
SELECT id, name, status, price, created_at
FROM items
{% where %}
  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}
  {% if status is defined %}AND status = {{ status | sql_int }}{% endif %}
  {% if active is defined %}AND is_active = {{ active | sql_bool }}{% endif %}
  {% if ids %}AND id IN {{ ids | in_list }}{% endif %}
  {% if filters and filters.min_price is defined %}AND price >= {{ filters.min_price | sql_float }}{% endif %}
  {% if filters and filters.max_price is defined %}AND price <= {{ filters.max_price | sql_float }}{% endif %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};`}
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">1.</span>
                <span><strong className="text-foreground">Always use filters</strong> — never output raw <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ param }}"}</code> without a filter. Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">sql_string</code>, <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">sql_int</code>, etc.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">2.</span>
                <span><strong className="text-foreground">Use {"{% where %}"}</strong> — it handles empty conditions and strips leading AND/OR automatically.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">3.</span>
                <span><strong className="text-foreground">Define parameters</strong> — set types and defaults in the Parameters tab. The gateway coerces values before they reach the template.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">4.</span>
                <span><strong className="text-foreground">Test with Debug</strong> — use the Debug tab to run queries with test parameters before publishing.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">5.</span>
                <span><strong className="text-foreground">Use macros</strong> — extract reusable SQL snippets into Macro Definitions. They are auto-prepended to your template and callable like <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ macro_name(args) }}"}</code>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">6.</span>
                <span><strong className="text-foreground">Multi-statement for data + count</strong> — separate statements with <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">;</code> and use a Result Transform to combine results.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">7.</span>
                <span><strong className="text-foreground">Comment with {"{# ... #}"}</strong> — Jinja2 comments are stripped before execution. Use them instead of SQL comments for template-level notes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">8.</span>
                <span><strong className="text-foreground">No file includes</strong> — templates render from strings, so <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% include %}"}</code> is not available. Use macros instead.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
