import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { API_BASE } from "@/lib/api-request"

export const Route = createFileRoute("/_layout/report-management/info")({
  component: ReportApiInfoPage,
  head: () => ({
    meta: [{ title: "API Info - Report Management" }],
  }),
})

function ReportApiInfoPage() {
  const base = API_BASE || window.location.origin

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Report API Integration Guide</h1>
        <p className="text-muted-foreground mt-1">
          Complete reference for integrating report generation with ToolJet, external systems, and custom applications.
        </p>
      </div>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Use client credentials (client_id + client_secret) to obtain a JWT token.
            Clients are managed in System → Clients, and must be assigned to report modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="bg-muted rounded-md p-4 overflow-x-auto text-xs font-mono whitespace-pre">
{`# Get token using client credentials
curl -X POST '${base}/api/token/generate' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "client_id": "your-client-id",
    "client_secret": "your-client-secret"
  }'

# Response:
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer"
}

# Use token in all subsequent requests:
Authorization: Bearer eyJhbGciOi...`}
          </pre>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Prerequisites:</strong></p>
            <p>1. Create a client in <strong>System → Clients</strong></p>
            <p>2. Assign the report module to the client (Report Modules field in client edit page)</p>
            <p>3. The client can then generate reports for all templates in assigned modules</p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Generate your first report in 3 steps</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Step 1</div>
              <div className="font-medium">Get Client Token</div>
              <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">
{`POST ${base}/api/token/generate

{
  "client_id": "my-app",
  "client_secret": "s3cret!"
}`}
              </pre>
            </div>
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Step 2</div>
              <div className="font-medium">Know your IDs</div>
              <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">
{`module_id and template_id
are shown in the URL when
you view them in the UI.

Or use the list APIs.`}
              </pre>
            </div>
            <div className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Step 3</div>
              <div className="font-medium">Generate Report</div>
              <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">
{`POST /report-modules/
  {mid}/templates/{tid}
  /generate

→ { output_url: "..." }`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>All endpoints use POST method and require dashboard JWT token</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Method</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/50">Modules</TableCell></TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/list</TableCell>
                <TableCell className="text-sm">List modules (paginated, filter by name/status)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/create</TableCell>
                <TableCell className="text-sm">Create module (name, minio_datasource_id, sql_datasource_id, buckets)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{id}"}</TableCell>
                <TableCell className="text-sm">Module detail with templates list and client IDs</TableCell>
              </TableRow>

              <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/50">Templates</TableCell></TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/templates/list</TableCell>
                <TableCell className="text-sm">List all templates (global, filter by module_id/name/status)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/create</TableCell>
                <TableCell className="text-sm">Create template with optional inline sheet_mappings</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}</TableCell>
                <TableCell className="text-sm">Template detail with sheet mappings</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/update</TableCell>
                <TableCell className="text-sm">Update template (body contains id)</TableCell>
              </TableRow>

              <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/50">Sheet Mappings</TableCell></TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}/mappings/create</TableCell>
                <TableCell className="text-sm">Add mapping (sheet_name, start_cell, sql_content, write_mode, write_headers)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}/mappings/update</TableCell>
                <TableCell className="text-sm">Update mapping (body contains id)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}/mappings/delete?mapping_id=</TableCell>
                <TableCell className="text-sm">Delete mapping by ID</TableCell>
              </TableRow>

              <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/50">Generate & Executions</TableCell></TableRow>
              <TableRow>
                <TableCell><Badge variant="default">POST</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}/generate</TableCell>
                <TableCell className="text-sm">Generate report (sync or async)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{mid}"}/templates/{"{tid}"}/executions</TableCell>
                <TableCell className="text-sm">Template execution history</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-executions/{"{exec_id}"}</TableCell>
                <TableCell className="text-sm">Get execution detail (poll for async status)</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-executions?module_id=&status=</TableCell>
                <TableCell className="text-sm">Global execution list with filters</TableCell>
              </TableRow>

              <TableRow><TableCell colSpan={3} className="font-semibold bg-muted/50">MinIO Helpers</TableCell></TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/buckets/{"{datasource_id}"}</TableCell>
                <TableCell className="text-sm">List MinIO buckets</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/files/{"{datasource_id}"}/{"{bucket}"}</TableCell>
                <TableCell className="text-sm">List .xlsx files in a bucket</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">GET</Badge></TableCell>
                <TableCell className="font-mono text-xs">/api/v1/report-modules/sheets/{"{datasource_id}"}/{"{bucket}"}/{"{path}"}</TableCell>
                <TableCell className="text-sm">List sheet names from an .xlsx file</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Generate API Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Report — Detailed Example</CardTitle>
          <CardDescription>The most important endpoint for integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h3 className="font-semibold">Sync Generation (wait for result)</h3>
            <pre className="bg-muted rounded-md p-4 overflow-x-auto text-xs font-mono whitespace-pre">
{`# 1. Get client token
TOKEN=$(curl -s -X POST '${base}/api/token/generate' \\
  -H 'Content-Type: application/json' \\
  -d '{"client_id": "mobile-app", "client_secret": "s3cret!"}' \\
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Generate report
curl -X POST '${base}/api/v1/report-modules/{module_id}/templates/{template_id}/generate' \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{
    "parameters": {
      "month": "2026-03",
      "region": "APAC"
    }
  }'

# Response:
{
  "execution_id": "uuid",
  "status": "success",
  "output_url": "https://minio:9000/report-output/...",
  "output_minio_path": "products/20260404_product-list.xlsx"
}`}
            </pre>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Async Generation (background processing)</h3>
            <pre className="bg-muted rounded-md p-4 overflow-x-auto text-xs font-mono whitespace-pre">
{`# Step 1: Start generation (async=true)
curl -X POST '${base}/api/v1/report-modules/{mid}/templates/{tid}/generate' \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"parameters": {"month": "2026-03"}, "async": true}'

# Response: {"execution_id": "abc-123", "status": "pending"}

# Step 2: Poll until complete
curl '${base}/api/v1/report-executions/abc-123' \\
  -H "Authorization: Bearer $TOKEN"

# Response when done:
{
  "status": "success",
  "output_url": "https://minio:9000/...",
  "started_at": "2026-04-04T10:00:00",
  "completed_at": "2026-04-04T10:00:03"
}`}
            </pre>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Generate Request Body</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs">parameters</TableCell>
                  <TableCell className="text-xs">object | null</TableCell>
                  <TableCell className="text-xs">null</TableCell>
                  <TableCell className="text-sm">Key-value params passed to SQL Jinja2 templates</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">async</TableCell>
                  <TableCell className="text-xs">boolean</TableCell>
                  <TableCell className="text-xs">false</TableCell>
                  <TableCell className="text-sm">If true, returns immediately with execution_id for polling</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ToolJet Integration */}
      <Card>
        <CardHeader>
          <CardTitle>ToolJet Integration</CardTitle>
          <CardDescription>Step-by-step guide for calling report APIs from ToolJet</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">1. Prerequisites</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>a. Create a client in <strong>System → Clients</strong> (e.g. client_id: <code className="bg-muted px-1 rounded">tooljet-app</code>)</p>
                <p>b. Assign the report module to this client (edit client → Report Modules)</p>
                <p>c. Note down the <code className="bg-muted px-1 rounded">client_id</code> and <code className="bg-muted px-1 rounded">client_secret</code></p>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">2. Create REST API Datasource in ToolJet</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[140px]">Base URL</TableHead>
                    <TableCell className="font-mono text-xs">{base}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Auth Type</TableHead>
                    <TableCell>None (token sent per query)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">3. Create Query: Get Token</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[140px]">Method</TableHead>
                    <TableCell>POST</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableCell className="font-mono text-xs">/api/token/generate</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Body</TableHead>
                    <TableCell>
                      <pre className="bg-muted rounded p-2 text-xs">{`{
  "client_id": "tooljet-app",
  "client_secret": "your-secret"
}`}</pre>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">
                Save the token: <code className="bg-muted px-1 rounded">{"{{queries.getToken.data.access_token}}"}</code>
              </p>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">4. Create Query: Generate Report</h4>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[140px]">Method</TableHead>
                    <TableCell>POST</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableCell className="font-mono text-xs">/api/v1/report-modules/{"{module_id}"}/templates/{"{template_id}"}/generate</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Headers</TableHead>
                    <TableCell>
                      <pre className="bg-muted rounded p-2 text-xs">{`Authorization: Bearer {{queries.getToken.data.access_token}}`}</pre>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Body</TableHead>
                    <TableCell>
                      <pre className="bg-muted rounded p-2 text-xs">{`{
  "parameters": {
    "month": "{{components.monthPicker.value}}"
  }
}`}</pre>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">5. Show Download Link</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Use <code className="bg-muted px-1 rounded">{"{{queries.generateReport.data.output_url}}"}</code> in a Link or Button component to download the file.
              </p>
              <pre className="bg-muted rounded p-2 text-xs">
{`// On query success event handler:
// 1. Show notification: "Report generated!"
// 2. Set variable: downloadUrl = {{queries.generateReport.data.output_url}}

// In a Link/Button component:
// URL: {{variables.downloadUrl}}
// Text: "Download Report"
// Open in new tab: true`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Create Template via API</CardTitle>
          <CardDescription>Full example with inline sheet mappings</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 overflow-x-auto text-xs font-mono whitespace-pre">
{`curl -X POST '${base}/api/v1/report-modules/{module_id}/templates/create' \\
  -H 'Authorization: Bearer <TOKEN>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "monthly-sales",
    "description": "Monthly sales report",
    "template_path": "sales/template.xlsx",
    "output_prefix": "sales/monthly/",
    "recalc_enabled": true,
    "output_sheet": "Summary",
    "sheet_mappings": [
      {
        "sheet_name": "RawData",
        "start_cell": "A2",
        "write_mode": "rows",
        "write_headers": false,
        "sql_content": "SELECT * FROM orders WHERE month = {{ month | sql_string }}",
        "sort_order": 1
      },
      {
        "sheet_name": "Categories",
        "start_cell": "A1",
        "write_mode": "rows",
        "write_headers": true,
        "sql_content": "SELECT code, name FROM categories",
        "sort_order": 2
      }
    ]
  }'`}
          </pre>
          <div className="mt-4 text-sm text-muted-foreground space-y-1">
            <p><strong>template_path:</strong> Path to .xlsx file in module's default template bucket. Empty = blank workbook.</p>
            <p><strong>output_prefix:</strong> Prefix for generated files in module's default output bucket.</p>
            <p><strong>recalc_enabled:</strong> Run LibreOffice to recalculate formulas before extracting output sheet.</p>
            <p><strong>output_sheet:</strong> Extract only this sheet (values + format). Requires recalc. Empty = return full file.</p>
            <p><strong>write_mode:</strong> <code>rows</code> (default) writes all query rows, <code>single</code> writes first cell only.</p>
            <p><strong>sql_content:</strong> Jinja2 SQL template. Parameters from generate request are available as {"{{ param_name }}"}.</p>
          </div>
        </CardContent>
      </Card>

      {/* Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Report Generation Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre">
{`POST /generate
  │
  ├─ 1. Download template from MinIO (or create blank workbook)
  │
  ├─ 2. For each sheet mapping (sorted by sort_order):
  │     ├─ Render SQL with Jinja2 ({{ params }})
  │     ├─ Execute query against SQL datasource
  │     └─ Write results to sheet at start_cell
  │
  ├─ 3. If recalc_enabled or output_sheet:
  │     └─ LibreOffice --headless recalculate formulas
  │
  ├─ 4. If output_sheet:
  │     └─ Extract single sheet (values + styles) → new file
  │
  ├─ 5. Upload output to MinIO (output bucket + prefix + timestamp)
  │
  └─ 6. Return { execution_id, status, output_url, output_minio_path }`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
