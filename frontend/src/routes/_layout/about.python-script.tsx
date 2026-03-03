import { createFileRoute } from "@tanstack/react-router"
import { Code, Copy, Check } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/about/python-script")({
  component: PythonScriptGuide,
  head: () => ({
    meta: [
      {
        title: "Python Script Guide",
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

function PythonScriptGuide() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Python Script Engine
          </CardTitle>
          <CardDescription>
            Write Python scripts in a secure RestrictedPython sandbox with built-in helpers for database, HTTP, cache, and more
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Overview</h3>
            <p className="text-muted-foreground">
              The Script engine executes your Python code inside a RestrictedPython sandbox.
              You cannot use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">import</code> —
              instead, all functionality is provided through injected context objects
              (<code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">db</code>,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">http</code>,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">cache</code>, etc.)
              and safe built-ins (<code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">json</code>,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">datetime</code>, etc.).
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Returning Data</h3>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                Your script must return data via one of two patterns (checked in this order):
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                    Option 1 (preferred): <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">def execute(params=None)</code> function
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Define a function that receives params dict and returns the result.
                    The gateway wraps the return value in <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">{`{"success": true, "data": <return_value>}`}</code>.
                    If your function returns <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">{`{"success": ..., "data": ..., "message": ...}`}</code>,
                    those keys are promoted to the top-level envelope.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                    Option 2: Global <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code> variable
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Assign data to the global <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code> variable directly.
                    Useful for simple scripts without function definitions.
                  </p>
                </div>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                If neither is set, the API returns <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">null</code>.
                The executor checks for <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">execute()</code> first — if both exist, the function takes priority.
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Context Objects</h3>
            <div className="space-y-5">
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">req</Badge>
                  Request Parameters
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  A dict containing all merged parameters (path, query, body, header):
                </p>
                <CodeBlock code={`# Access individual params
user_id = req.get("user_id")
name = req.get("name", "default")
page = req.get("page", 1)

# req is a regular dict
for key, value in req.items():
    log.info(f"{key} = {value}")`} />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">db</Badge>
                  Database Operations
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Execute SQL against the configured data source. Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">%s</code> placeholders for safe parameterized queries:
                </p>
                <div className="space-y-1 mb-3">
                  <div>
                    <code className="text-xs font-mono text-foreground">db.query(sql, params?)</code>
                    <span className="text-xs text-muted-foreground ml-2">Returns list[dict] — multiple rows</span>
                  </div>
                  <div>
                    <code className="text-xs font-mono text-foreground">db.query_one(sql, params?)</code>
                    <span className="text-xs text-muted-foreground ml-2">Returns dict | None — first row only</span>
                  </div>
                  <div>
                    <code className="text-xs font-mono text-foreground">db.execute(sql, params?)</code>
                    <span className="text-xs text-muted-foreground ml-2">Returns int — affected row count (INSERT/UPDATE/DELETE)</span>
                  </div>
                  <div>
                    <code className="text-xs font-mono text-foreground">db.insert / db.update / db.delete</code>
                    <span className="text-xs text-muted-foreground ml-2">Aliases for db.execute()</span>
                  </div>
                </div>
                <CodeBlock
                  code={`# Query multiple rows
users = db.query("SELECT id, name FROM users WHERE status = %s", (1,))

# Query single row
user = db.query_one("SELECT * FROM users WHERE id = %s", (user_id,))

# INSERT / UPDATE / DELETE
rowcount = db.execute(
    "UPDATE users SET status = %s WHERE id = %s",
    (1, user_id)
)

# Each operation auto-commits unless inside tx.begin()...tx.commit()`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">tx</Badge>
                  Transactions
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Wrap multiple database operations in an explicit transaction:
                </p>
                <CodeBlock
                  code={`tx.begin()
try:
    db.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, from_id))
    db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_id))
    tx.commit()
    result = {"success": True, "message": "Transfer complete"}
except Exception as e:
    tx.rollback()
    result = {"success": False, "message": str(e)}`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">http</Badge>
                  HTTP Client
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Make outbound HTTP requests to external APIs:
                </p>
                <CodeBlock
                  code={`# GET with query params
data = http.get("https://api.example.com/users", params={"page": 1})

# POST with JSON body
resp = http.post("https://api.example.com/data", json={"key": "value"})

# POST with form data
resp = http.post("https://api.example.com/form", data={"field": "value"})

# PUT and DELETE
http.put(url, json=payload)
http.delete(url)

# Custom headers and cookies
resp = http.get(url, headers={"X-API-Key": "abc"}, cookies={"session": "xyz"})

# Returns: parsed JSON if Content-Type is application/json, else plain text
# Timeout: 30 seconds by default
# Allowed hosts: controlled by SCRIPT_HTTP_ALLOWED_HOSTS (admin setting)
# If host is not whitelisted, the request is blocked with ConnectionError`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">cache</Badge>
                  Cache (Redis)
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Read and write cached data with optional TTL. Keys are auto-prefixed with{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">script:</code>:
                </p>
                <CodeBlock
                  code={`# Get (returns None if not found)
cached = cache.get("user_123")

# Set with TTL (seconds)
cache.set("user_123", user_data, ttl_seconds=300)

# Set without TTL (no expiration)
cache.set("config", config_data)

# Delete a key
cache.delete("user_123")

# Check existence
if cache.exists("user_123"):
    data = cache.get("user_123")

# Atomic increment / decrement (returns new value)
count = cache.incr("page_views", amount=1)
count = cache.decr("stock", amount=1)

# Note: all keys are auto-prefixed with "script:"
# cache.get("user_123") → Redis key "script:user_123"
# When Redis is unavailable, all operations silently no-op`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">log</Badge>
                  Logging
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Write log entries at different levels:
                </p>
                <CodeBlock
                  code={`log.info("Processing user", extra={"user_id": user_id})
log.warning("Deprecated param used")
log.error("Query failed", extra={"sql": sql, "error": str(e)})
log.debug("Debug details")

# Logs go to the backend logger with script context`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">env</Badge>
                  Environment Variables
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Access whitelisted environment variables (prevents leaking secrets):
                </p>
                <CodeBlock
                  code={`api_key = env.get("EXTERNAL_API_KEY", default=None)
max_results = env.get_int("MAX_RESULTS", default=100)
debug_mode = env.get_bool("DEBUG", default=False)`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">ds</Badge>
                  DataSource Metadata
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Read-only info about the configured data source:
                </p>
                <CodeBlock
                  code={`db_name = ds["database"]
db_type = ds["product_type"]  # "POSTGRES", "MYSQL", or "TRINO"
host = ds["host"]
port = ds["port"]
name = ds["name"]`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Safe Built-ins</h3>
            <p className="text-sm text-muted-foreground mb-2">
              These are available as globals without import:
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="p-3 border rounded-md">
                <p className="text-sm font-medium">Data types</p>
                <p className="text-xs text-muted-foreground mt-1">
                  dict, list, set, tuple, str, int, float, bool, range, type
                </p>
              </div>
              <div className="p-3 border rounded-md">
                <p className="text-sm font-medium">Utilities</p>
                <p className="text-xs text-muted-foreground mt-1">
                  len, min, max, sum, abs, round, sorted, enumerate, zip, map, filter
                </p>
              </div>
              <div className="p-3 border rounded-md">
                <p className="text-sm font-medium">JSON</p>
                <p className="text-xs text-muted-foreground mt-1">
                  json.loads, json.dumps
                </p>
              </div>
              <div className="p-3 border rounded-md">
                <p className="text-sm font-medium">Date/Time</p>
                <p className="text-xs text-muted-foreground mt-1">
                  datetime, date, time, timedelta
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Extra Libraries</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Admins can whitelist additional modules via{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">SCRIPT_EXTRA_MODULES</code>{" "}
              (e.g. <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">pandas,numpy</code>).
              Whitelisted modules are injected as globals — use them directly, no import needed.
              The module must be installed in the backend environment.
            </p>
            <CodeBlock
              code={`# When SCRIPT_EXTRA_MODULES includes "pandas":
rows = db.query("SELECT id, name, score FROM users")
df = pandas.DataFrame(rows)

result = {
    "mean_score": float(df["score"].mean()),
    "max_score": float(df["score"].max()),
    "count": len(rows)
}`}
              title="Example: Using pandas"
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Examples</h3>
            <div className="space-y-4">
              <CodeBlock
                title="Query with filtering and pagination"
                code={`def execute(params=None):
    params = params or {}
    limit = int(params.get("limit", 20))
    offset = int(params.get("offset", 0))
    q = params.get("q", "").strip()
    status = params.get("status")

    where = "WHERE 1=1"
    args = []

    if q:
        where += " AND name ILIKE %s"
        args.append(f"%{q}%")
    if status is not None:
        where += " AND status = %s"
        args.append(status)

    total_row = db.query_one(f"SELECT COUNT(*) AS total FROM items {where}", tuple(args))
    total = total_row["total"] if total_row else 0

    rows = db.query(
        f"SELECT id, name, status, created_at FROM items {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
        tuple(args + [limit, offset])
    )

    return {"data": rows, "total": total, "offset": offset, "limit": limit}`}
              />

              <CodeBlock
                title="Cache-aside pattern"
                code={`user_id = req.get("user_id")
cache_key = f"user_{user_id}"
cached = cache.get(cache_key)

if cached:
    result = cached
else:
    user = db.query_one("SELECT * FROM users WHERE id = %s", (user_id,))
    if user:
        cache.set(cache_key, user, ttl_seconds=300)
        result = user
    else:
        result = {"error": "User not found"}`}
              />

              <CodeBlock
                title="External API integration"
                code={`def execute(params=None):
    page = (params or {}).get("page", 1)

    # Fetch from external API
    api_data = http.get("https://api.example.com/users", params={"page": page})

    # Store in database
    imported = 0
    for item in api_data.get("data", []):
        db.insert(
            "INSERT INTO synced_users (external_id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (item["id"], item["name"])
        )
        imported += 1

    return {"imported": imported, "page": page}`}
              />

              <CodeBlock
                title="Transaction with error handling"
                code={`def execute(params=None):
    params = params or {}
    from_id = params.get("from_account")
    to_id = params.get("to_account")
    amount = float(params.get("amount", 0))

    if amount <= 0:
        return {"error": "Amount must be positive"}

    tx.begin()
    try:
        # Check balance
        sender = db.query_one("SELECT balance FROM accounts WHERE id = %s", (from_id,))
        if not sender or sender["balance"] < amount:
            tx.rollback()
            return {"error": "Insufficient balance"}

        db.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, from_id))
        db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_id))
        tx.commit()
        return {"success": True, "transferred": amount}
    except Exception as e:
        tx.rollback()
        log.error("Transfer failed", extra={"error": str(e)})
        return {"error": str(e)}`}
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Security and Limitations</h3>
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Sandboxed Execution (RestrictedPython)
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 ml-4 list-disc">
                <li>No file system access — <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">open()</code>, <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">os</code>, <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">subprocess</code> are blocked</li>
                <li>No arbitrary imports — only context objects and whitelisted modules via <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">SCRIPT_EXTRA_MODULES</code></li>
                <li>No dangerous builtins — <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">exec</code>, <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">eval</code>, <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">compile</code>, <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">__import__</code> are blocked</li>
                <li>Attribute and item access are guarded by RestrictedPython</li>
                <li>Optional timeout via <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">SCRIPT_EXEC_TIMEOUT</code> (seconds) — aborts long-running scripts</li>
                <li>HTTP calls can be restricted to specific hosts via <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">SCRIPT_HTTP_ALLOWED_HOSTS</code></li>
                <li>Python macros from Macro Definitions are auto-prepended to your script</li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">1.</span>
                <span><strong className="text-foreground">Return data</strong> — use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">def execute(params)</code> or assign to <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">result</code>. If neither is set, the API returns null.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">2.</span>
                <span><strong className="text-foreground">Use parameterized queries</strong> — always use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">%s</code> placeholders with <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">db.query(sql, params)</code> instead of string formatting.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">3.</span>
                <span><strong className="text-foreground">Handle errors</strong> — use try/except and return meaningful error messages.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">4.</span>
                <span><strong className="text-foreground">Use transactions</strong> — wrap multi-step DB operations in <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">tx.begin()</code> / <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">tx.commit()</code> for atomicity.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">5.</span>
                <span><strong className="text-foreground">Cache expensive operations</strong> — use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">cache</code> to avoid repeated DB or HTTP calls.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">6.</span>
                <span><strong className="text-foreground">Log for debugging</strong> — use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">log.info()</code> / <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">log.error()</code> to trace execution in backend logs.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
