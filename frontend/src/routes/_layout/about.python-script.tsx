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
            <h3 className="text-lg font-semibold mb-3">Important: Result Variable</h3>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ Your script must assign a <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code> variable
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                The API returns whatever value is assigned to <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code>. 
                If <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">result</code> is not set, the API returns <code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono">null</code>.
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
                    <p className="text-xs text-muted-foreground">Returns list[dict] - multiple rows</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.query_one(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Returns dict | None - single row</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.execute(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Returns int - rowcount for DML</p>
                  </div>
                  <div>
                    <code className="text-xs font-mono">db.insert/update/delete(sql, params?)</code>
                    <p className="text-xs text-muted-foreground">Aliases for execute()</p>
                  </div>
                </div>
                <CodeBlock
                  code={`# Query multiple rows
users = db.query("SELECT id, name FROM users WHERE status = %s", (1,))

# Query single row
user = db.query_one("SELECT * FROM users WHERE id = %s", (user_id,))

# Execute DML
rowcount = db.execute("UPDATE users SET status = %s WHERE id = %s", (1, user_id))`}
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
                  code={`# GET request
data = http.get("https://api.example.com/users", params={"page": 1})

# POST request
response = http.post("https://api.example.com/data", json={"key": "value"})

# PUT/DELETE also available
http.put(url, json=data)
http.delete(url)`}
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
                  code={`# Get from cache
cached = cache.get("user_123")

# Set cache (TTL in seconds)
cache.set("user_123", user_data, ttl=300)  # 5 minutes

# Check existence
if cache.exists("key"):
    value = cache.get("key")

# Increment/decrement
cache.incr("counter")
cache.decr("counter")`}
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
                  code={`log.info("Processing request", extra={"user_id": user_id})
log.warning("User not found", extra={"user_id": user_id})
log.error("Database error", extra={"error": str(e)})
log.debug("Debug information")`}
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
                  code={`api_key = env.get("EXTERNAL_API_KEY")
max_results = env.get_int("MAX_RESULTS", 100)
debug_mode = env.get_bool("DEBUG", False)`}
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
def execute(params=None):
    params = params or {}
    rows = db.query("SELECT id, name, score FROM users")
    df = pandas.DataFrame(rows)
    summary = df["score"].mean()
    return {"mean_score": float(summary), "count": len(rows)}`}
                  title="Example: pandas (if enabled)"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Examples</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Example 1: Simple Query</h4>
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
    
    # Update status
    db.update(
        "UPDATE users SET status = 1 WHERE email = %s",
        (req.get("email"),)
    )
    
    tx.commit()
    result = {"success": True, "message": "User created and activated"}
except Exception as e:
    tx.rollback()
    log.error(f"Transaction failed: {str(e)}")
    result = {"error": str(e)}`}
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
        # Cache for 5 minutes (300 seconds)
        cache.set(cache_key, user, ttl=300)
        result = user
    else:
        result = {"error": "User not found"}`}
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
                <li>No unrestricted imports</li>
                <li>No dangerous operations (exec, eval, etc.)</li>
                <li>Only safe built-ins available: dict, list, str, int, float, bool, range, enumerate, zip, sorted, len, round, min, max, sum, abs</li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Best Practices</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span><strong className="text-foreground">Always set result:</strong> Your script must assign a <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">result</code> variable to return data.</span>
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
