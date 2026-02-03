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
            Python Script Execution
          </CardTitle>
          <CardDescription>
            Execute Python scripts in a secure sandbox with database, HTTP, cache, and logging access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Overview</h3>
            <p className="text-muted-foreground">
              Python Script execution engine allows you to write Python code that runs in a RestrictedPython sandbox. 
              Your script has access to database operations, HTTP clients, caching, environment variables, and logging.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Important: Return Value</h3>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ Your script must return a value
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                You can return data in two ways:
              </p>
              <ul className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1 ml-4 list-disc">
                <li>
                  <strong>Option 1:</strong> Define a function <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">def execute(params=None):</code> that returns the result
                </li>
                <li>
                  <strong>Option 2:</strong> Assign to a global variable <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code>
                </li>
              </ul>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-2">
                If neither is set, the API returns <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">null</code>.
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Available Modules</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">req</Badge>
                  Request Parameters
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Dictionary containing all parameters passed to the API:
                </p>
                <CodeBlock code={`user_id = req.get("user_id")
name = req.get("name", "default")
all_params = req  # Access all params as dict`} />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">db</Badge>
                  Database Operations
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Execute SQL queries against the configured datasource:
                </p>
                <div className="space-y-2">
                  <div>
                    <code className="text-xs font-mono">db.query(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Returns list[dict] - multiple rows. params can be tuple/list/dict.</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.query_one(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Returns dict | None - single row (first result)</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.execute(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Returns int - rowcount for INSERT/UPDATE/DELETE</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.insert/update/delete(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Aliases for execute() - same behavior</p>
                  </div>
                </div>
                <CodeBlock
                  code={`# Query multiple rows (params as tuple)
users = db.query("SELECT id, name FROM users WHERE status = %s", (1,))

# Query with list params
users = db.query("SELECT * FROM users WHERE id IN (%s, %s)", [1, 2])

# Query single row
user = db.query_one("SELECT * FROM users WHERE id = %s", (user_id,))

# Execute DML (INSERT/UPDATE/DELETE)
rowcount = db.execute("UPDATE users SET status = %s WHERE id = %s", (1, user_id))

# Auto-commit: Each query/execute auto-commits unless inside tx.begin()...tx.commit()`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">tx</Badge>
                  Transaction Control
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Control database transactions explicitly:
                </p>
                <CodeBlock
                  code={`tx.begin()
try:
    db.execute("UPDATE users SET balance = balance - %s WHERE id = %s", (amount, user_id))
    db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, account_id))
    tx.commit()
    result = {"success": True}
except Exception as e:
    tx.rollback()
    result = {"error": str(e)}`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">http</Badge>
                  HTTP Client
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Make HTTP requests to external APIs:
                </p>
                <CodeBlock
                  code={`# GET request (returns JSON or text automatically)
data = http.get("https://api.example.com/users", params={"page": 1})

# POST request with JSON body
response = http.post("https://api.example.com/data", json={"key": "value"})

# POST with form data
response = http.post("https://api.example.com/data", data={"key": "value"})

# PUT/DELETE also available
http.put(url, json=data)
http.delete(url)

# Default timeout: 30 seconds (configurable)`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">cache</Badge>
                  Caching
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Cache data with TTL (time-to-live):
                </p>
                <CodeBlock
                  code={`# Get from cache (returns None if not found)
cached = cache.get("user_123")

# Set cache with TTL (ttl_seconds parameter)
cache.set("user_123", user_data, ttl_seconds=300)  # 5 minutes

# Set without TTL (no expiration)
cache.set("user_123", user_data)

# Check existence
if cache.exists("key"):
    value = cache.get("key")

# Increment/decrement (returns new value)
new_count = cache.incr("counter", amount=1)
new_count = cache.decr("counter", amount=1)

# Note: Keys are prefixed with "script:" automatically`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">log</Badge>
                  Logging
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Log messages for debugging and monitoring:
                </p>
                <CodeBlock
                  code={`# Logging levels: info, warn, error, debug
log.info("Processing request", extra={"user_id": user_id})
log.warning("User not found", extra={"user_id": user_id})
log.error("Database error", extra={"error": str(e)})
log.debug("Debug information")

# extra parameter adds context to log entries
# Logs are written to backend logger with script context`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">env</Badge>
                  Environment Variables
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Access whitelisted environment variables:
                </p>
                <CodeBlock
                  code={`# Access whitelisted environment variables only
api_key = env.get("EXTERNAL_API_KEY", default=None)
max_results = env.get_int("MAX_RESULTS", default=100)
debug_mode = env.get_bool("DEBUG", default=False)

# Only keys in whitelist are accessible (prevents leaking secrets)
# Default whitelist includes: PROJECT_NAME, ENVIRONMENT, API_V1_STR, etc.`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">ds</Badge>
                  DataSource Metadata
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Read-only information about the datasource:
                </p>
                <CodeBlock
                  code={`# Access datasource info
db_name = ds["database"]
db_type = ds["product_type"]  # "POSTGRES" or "MYSQL"
host = ds["host"]
port = ds["port"]`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Badge variant="outline">Extra libraries (pandas, etc.)</Badge>
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Admins can enable extra modules via <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">SCRIPT_EXTRA_MODULES</code> (comma-separated, e.g. <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">pandas,numpy</code>). 
                  Those modules are injected as globals: use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">pandas</code> directly in the script (no <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">import</code>). 
                  The backend must have the package installed (e.g. <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">pip install pandas</code>).
                </p>
                <CodeBlock
                  code={`# When SCRIPT_EXTRA_MODULES includes "pandas":
# pandas is injected as a global (no import needed)
rows = db.query("SELECT id, name, score FROM users")
df = pandas.DataFrame(rows)
summary = df["score"].mean()
result = {"mean_score": float(summary), "count": len(rows)}

# OR use execute() function pattern:
def execute(params=None):
    rows = db.query("SELECT id, name, score FROM users")
    df = pandas.DataFrame(rows)
    return {"mean_score": float(df["score"].mean()), "count": len(rows)}`}
                  title="Example: pandas (if enabled)"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Examples</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Example 1: Simple Query (using result variable)</h4>
                <CodeBlock
                  code={`user_id = req.get("user_id")
if not user_id:
    result = {"error": "user_id is required"}
else:
    user = db.query_one(
        "SELECT id, name, email FROM users WHERE id = %s",
        (user_id,)
    )
    result = {"user": user} if user else {"error": "User not found"}`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 1b: Simple Query (using execute function)</h4>
                <CodeBlock
                  code={`def execute(params=None):
    params = params or {}
    user_id = params.get("user_id")
    if not user_id:
        return {"error": "user_id is required"}
    
    user = db.query_one(
        "SELECT id, name, email FROM users WHERE id = %s",
        (user_id,)
    )
    return {"user": user} if user else {"error": "User not found"}`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 2: Complex Processing</h4>
                <CodeBlock
                  code={`# Get users from database
users = db.query("SELECT id, name, age FROM users WHERE age >= %s", (req.get("min_age", 18),))

# Process and transform data
processed = []
for u in users:
    processed.append({
        "id": u["id"],
        "name": u["name"],
        "age": u["age"],
        "category": "adult" if u["age"] >= 18 else "minor"
    })

result = {
    "total": len(processed),
    "users": processed
}`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 3: Transaction with Error Handling</h4>
                <CodeBlock
                  code={`tx.begin()
try:
    # Insert user
    db.insert(
        "INSERT INTO users (name, email) VALUES (%s, %s)",
        (req.get("name"), req.get("email"))
    )
    
    # Update status (within same transaction)
    db.update(
        "UPDATE users SET status = 1 WHERE email = %s",
        (req.get("email"),)
    )
    
    tx.commit()
    result = {"success": True, "message": "User created and activated"}
except Exception as e:
    tx.rollback()
    log.error(f"Transaction failed: {str(e)}")
    result = {"error": str(e)}

# Note: Without tx.begin(), each db.execute() auto-commits`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 4: Using Cache</h4>
                <CodeBlock
                  code={`cache_key = f"user_{req.get('user_id')}"
cached = cache.get(cache_key)

if cached:
    result = cached
else:
    # Query from DB
    user = db.query_one("SELECT * FROM users WHERE id = %s", (req.get("user_id"),))
    
    if user:
        # Cache for 5 minutes (300 seconds) - note: ttl_seconds parameter
        cache.set(cache_key, user, ttl_seconds=300)
        result = user
    else:
        result = {"error": "User not found"}

# Note: Cache keys are automatically prefixed with "script:"`}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Example 5: External API Integration</h4>
                <CodeBlock
                  code={`try:
    # Fetch from external API
    external_data = http.get(
        "https://api.example.com/users",
        params={"page": req.get("page", 1)}
    )
    
    # Process and save to DB
    imported_count = 0
    for item in external_data.get("data", []):
        db.insert(
            "INSERT INTO external_users (external_id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (item["id"], item["name"])
        )
        imported_count += 1
    
    result = {"imported": imported_count}
except Exception as e:
    log.error(f"Failed to fetch external data: {str(e)}")
    result = {"error": f"Failed to fetch external data: {str(e)}"}`}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Security & Limitations</h3>
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                🔒 Sandboxed Execution
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 ml-4 list-disc">
                <li>Scripts run in RestrictedPython sandbox</li>
                <li>No file system access (no <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs font-mono">open()</code>)</li>
                <li>No unrestricted imports (only whitelisted modules via SCRIPT_EXTRA_MODULES)</li>
                <li>No dangerous operations (exec, eval, compile, etc.)</li>
                <li>Safe built-ins: dict, list, str, int, float, bool, range, enumerate, zip, sorted, len, round, min, max, sum, abs, json.loads, json.dumps, datetime, date, time, timedelta</li>
                <li>Optional timeout: SCRIPT_EXEC_TIMEOUT (seconds) uses SIGALRM on Unix to abort long-running scripts</li>
                <li>Macro support: Python macros from Macro Defs (same module) are auto-prepended before your script</li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Best Practices</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Return data:</strong> Either define <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">def execute(params=None):</code> that returns a value, or assign to global <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">result</code> variable.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Use transactions:</strong> Wrap multiple DB operations in <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">tx.begin()</code> / <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">tx.commit()</code> for atomicity.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Handle errors:</strong> Use try/except blocks and return meaningful error messages.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Use cache:</strong> Cache expensive operations or frequently accessed data.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Log important events:</strong> Use <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">log</code> for debugging and monitoring.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
