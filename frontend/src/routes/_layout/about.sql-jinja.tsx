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
      meaning: "Value is iterable",
      example: "{% if ids is iterable %}",
    },
    {
      condition: "{% if name is even %}",
      meaning: "Number is even",
      example: "{% if page is even %}",
    },
    {
      condition: "{% if name is odd %}",
      meaning: "Number is odd",
      example: "{% if page is odd %}",
    },
    {
      condition: "{% if a is divisibleby n %}",
      meaning: "Divisible test",
      example: "{% if limit is divisibleby 10 %}",
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
            Write dynamic SQL queries using Jinja2 syntax for parameters, conditionals, and loops
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Overview</h3>
            <p className="text-muted-foreground">
              SQL (Jinja2) execution engine allows you to write SQL queries with Jinja2 template syntax. 
              This enables dynamic queries with parameters, conditional logic, and loops without writing backend code.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Basic Syntax</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">1. Output Variables</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ variable }}"}</code> to output parameter values:
                </p>
                <CodeBlock
                  code={`SELECT * FROM users WHERE id = {{ user_id | sql_int }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">2. SQL Filters (Important!)</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Always use SQL filters to safely escape values and prevent SQL injection:
                </p>
                <div className="space-y-2">
                  <div>
                    <Badge variant="outline" className="mb-1">sql_string</Badge>
                    <CodeBlock code={`WHERE name = {{ name | sql_string }}`} />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1">sql_int</Badge>
                    <CodeBlock code={`WHERE age = {{ age | sql_int }}`} />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1">sql_bool</Badge>
                    <CodeBlock code={`WHERE active = {{ is_active | sql_bool }}`} />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1">in_list</Badge>
                    <CodeBlock code={`WHERE id IN {{ ids | in_list }}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Conditional Logic</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">If Statements</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% if %}"}</code> for conditional SQL:
                </p>
                <CodeBlock
                  code={`SELECT id, name, status
FROM users
{% where %}
  {% if ids %}id IN {{ ids | in_list }}{% endif %}
  {% if name %}AND name ILIKE {{ name | sql_like }}{% endif %}
  {% if min_age %}AND age >= {{ min_age | sql_int }}{% endif %}
{% endwhere %}
ORDER BY id DESC
LIMIT {{ limit | sql_int }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">If / Else (inline)</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  You can use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% else %}"}</code> and{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% elif %}"}</code> to branch logic:
                </p>
                <CodeBlock
                  code={`SELECT
  id,
  name,
  {% if status == 1 %}'active'{% else %}'inactive'{% endif %} AS status_label
FROM users
WHERE id = {{ user_id | sql_int }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Custom {"{% where %}"} Tag</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  The <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% where %}"}</code> tag automatically:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Adds <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">WHERE</code> keyword if conditions exist</li>
                  <li>Strips leading <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">AND</code> or <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">OR</code></li>
                  <li>Returns empty string if no conditions</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">If conditions cheat sheet (Jinja2)</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Common patterns you can use inside <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% if ... %}"}</code>.
            </p>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[320px]">Condition</TableHead>
                    <TableHead className="w-[280px]">Meaning</TableHead>
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
            <h3 className="text-lg font-semibold mb-3">Loops & Variables</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">For loops</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% for %}"}</code> when you need more control than{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ ids | in_list }}"}</code>:
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
                <h4 className="font-medium mb-2">Set variables</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% set %}"}</code> to reuse computed values (e.g. default limit):
                </p>
                <CodeBlock
                  code={`{% set lim = (limit if limit is defined else 50) | sql_int %}
{% set off = (offset if offset is defined else 0) | sql_int %}

SELECT id, name
FROM users
ORDER BY id DESC
LIMIT {{ lim }} OFFSET {{ off }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Notes</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>
                    <strong className="text-foreground">Prefer filters</strong> (e.g. <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"sql_string"}</code>,{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"sql_int"}</code>) instead of manual quoting.
                  </li>
                  <li>
                    Template is rendered from a <strong className="text-foreground">string</strong>, so typical Jinja file-based features like{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{% include %}"}</code> may not be available.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Available Filters</h3>
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_string</code>
                  <p className="text-xs text-muted-foreground mt-1">Escapes strings, None → NULL</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_int</code>
                  <p className="text-xs text-muted-foreground mt-1">Validates integers, None → NULL</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_float</code>
                  <p className="text-xs text-muted-foreground mt-1">Validates floats, None → NULL</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_bool</code>
                  <p className="text-xs text-muted-foreground mt-1">Converts to TRUE/FALSE</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_date</code>
                  <p className="text-xs text-muted-foreground mt-1">Formats as YYYY-MM-DD</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_datetime</code>
                  <p className="text-xs text-muted-foreground mt-1">Formats as ISO datetime</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">in_list</code>
                  <p className="text-xs text-muted-foreground mt-1">Converts array to (1, 2, 3)</p>
                </div>
                <div className="p-3 border rounded-md">
                  <code className="text-sm font-mono">sql_like</code>
                  <p className="text-xs text-muted-foreground mt-1">Wraps with % for LIKE queries</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Examples</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Example 1: Simple Query with Parameters</h4>
                <CodeBlock
                  code={`SELECT
  {{ col1 | sql_string }} AS col1,
  {{ col2 | sql_string }} AS col2,
  {{ col3 | sql_int }} AS col3;`}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Params:</strong> <code>{`{"col1": "a", "col2": "b", "col3": 10}`}</code>
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 2: Dynamic WHERE with Multiple Conditions</h4>
                <CodeBlock
                  code={`SELECT id, name, email, status
FROM users
{% where %}
  {% if user_ids %}id IN {{ user_ids | in_list }}{% endif %}
  {% if search_name %}AND name ILIKE {{ search_name | sql_like }}{% endif %}
  {% if status %}AND status = {{ status | sql_int }}{% endif %}
{% endwhere %}
ORDER BY created_at DESC
LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 3: Conditional JOIN</h4>
                <CodeBlock
                  code={`SELECT u.id, u.name, p.title
FROM users u
{% if include_profile %}
LEFT JOIN profiles p ON p.user_id = u.id
{% endif %}
WHERE u.active = TRUE;`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Best Practices</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Always use filters:</strong> Never use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ param }}"}</code> directly. Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">{"{{ param | sql_string }}"}</code> or appropriate filter.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Use {"{% where %}"} tag:</strong> Makes dynamic WHERE clauses cleaner and safer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Test with Debug:</strong> Use the Debug tab to test your queries with different parameter combinations.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Define Parameters:</strong> Always define parameters in the Basic Info tab for validation and autocomplete.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
