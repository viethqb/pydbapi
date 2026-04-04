#!/usr/bin/env bash
# E2E test for Report Engine v2 (module hierarchy)
set -euo pipefail

API="http://localhost"
USER="admin"
PASS="changethis"
MINIO_HOST="localhost:9000"
MINIO_USER="minioadmin"
MINIO_PASS="minioadmin"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# 1. Login
echo "=== Step 1: Login ==="
TOKEN=$(curl -sf "$API/api/v1/login/access-token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$USER&password=$PASS" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
[ -n "$TOKEN" ] && ok "Login OK" || fail "Login failed"
AUTH="Authorization: Bearer $TOKEN"

# 2. Create MinIO datasource
echo "=== Step 2: Create MinIO datasource ==="
MINIO_DS_ID=$(curl -sf "$API/api/v1/datasources/create" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Test MinIO","product_type":"minio","host":"minio","port":9000,"database":"templates","username":"'"$MINIO_USER"'","password":"'"$MINIO_PASS"'","use_ssl":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$MINIO_DS_ID" ] && ok "MinIO DS: $MINIO_DS_ID" || fail "Create MinIO DS failed"

# 3. Get SQL datasource
echo "=== Step 3: Get SQL datasource ==="
SQL_DS_ID=$(curl -sf "$API/api/v1/datasources/list" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{"page":1,"page_size":10}' \
  | python3 -c "import sys,json; print([d['id'] for d in json.load(sys.stdin)['data'] if d['product_type']=='postgres'][0])")
[ -n "$SQL_DS_ID" ] && ok "SQL DS: $SQL_DS_ID" || fail "No PostgreSQL DS"

# 4. Upload test template
echo "=== Step 4: Upload template to MinIO ==="
python3 -c "
from openpyxl import Workbook
from minio import Minio
wb = Workbook()
ws = wb.active; ws.title = 'Data'
ws['A1'] = 'id'; ws['B1'] = 'name'
ws2 = wb.create_sheet('Summary')
ws2['A1'] = 'Total:'; ws2['B1'] = '=COUNTA(Data!A4:A10000)'
wb.save('/tmp/test_tpl.xlsx')
client = Minio('$MINIO_HOST', access_key='$MINIO_USER', secret_key='$MINIO_PASS', secure=False)
for b in ['templates','output']:
    if not client.bucket_exists(b): client.make_bucket(b)
client.fput_object('templates', 'test/report.xlsx', '/tmp/test_tpl.xlsx')
print('OK')
" && ok "Template uploaded" || fail "Upload failed"

# 5. Create Report Module
echo "=== Step 5: Create report module ==="
MOD_ID=$(curl -sf "$API/api/v1/report-modules/create" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test-module\",\"minio_datasource_id\":\"$MINIO_DS_ID\",\"sql_datasource_id\":\"$SQL_DS_ID\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$MOD_ID" ] && ok "Module: $MOD_ID" || fail "Create module failed"

# 6. Create Template with inline mappings
echo "=== Step 6: Create template with mappings ==="
TPL_RESULT=$(curl -sf "$API/api/v1/report-modules/$MOD_ID/templates/create" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name":"test-report",
    "template_bucket":"templates","template_path":"test/report.xlsx",
    "output_bucket":"output","output_prefix":"test/",
    "sheet_mappings":[
      {"sheet_name":"Data","start_cell":"A4","write_headers":true,
       "sql_content":"SELECT id, email, full_name FROM \"user\" LIMIT 5","sort_order":1}
    ]
  }')
TPL_ID=$(echo "$TPL_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
MAPPING_COUNT=$(echo "$TPL_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['sheet_mappings']))")
[ "$MAPPING_COUNT" = "1" ] && ok "Template: $TPL_ID (1 mapping)" || fail "Expected 1 mapping"

# 7. Get module detail
echo "=== Step 7: Module detail ==="
MOD_DETAIL=$(curl -sf "$API/api/v1/report-modules/$MOD_ID" -H "$AUTH")
TPL_COUNT=$(echo "$MOD_DETAIL" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['templates']))")
[ "$TPL_COUNT" = "1" ] && ok "Module has 1 template" || fail "Expected 1 template"

# 8. Set module clients
echo "=== Step 8: Module clients ==="
CLIENT_ID=$(curl -sf "$API/api/v1/clients/list" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"page":1,"page_size":1}' | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print(d[0]['id'] if d else '')
")
if [ -n "$CLIENT_ID" ]; then
  curl -sf "$API/api/v1/report-modules/$MOD_ID/clients" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -X POST -d "{\"client_ids\":[\"$CLIENT_ID\"]}" > /dev/null
  ok "Client assigned: $CLIENT_ID"
else
  ok "No clients to assign (skip)"
fi

# 9. Generate report (sync)
echo "=== Step 9: Generate report ==="
GEN=$(curl -sf "$API/api/v1/report-modules/$MOD_ID/templates/$TPL_ID/generate" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{}')
GEN_STATUS=$(echo "$GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
EXEC_ID=$(echo "$GEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['execution_id'])")
[ "$GEN_STATUS" = "success" ] && ok "Generated: status=$GEN_STATUS" || fail "Generate failed: $GEN"

# 10. Verify execution
echo "=== Step 10: Verify execution ==="
EXEC=$(curl -sf "$API/api/v1/report-executions/$EXEC_ID" -H "$AUTH")
EXEC_STATUS=$(echo "$EXEC" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$EXEC_STATUS" = "success" ] && ok "Execution: $EXEC_STATUS" || fail "Expected success"

# 11. Filter by module
echo "=== Step 11: Filter executions by module ==="
FILTERED=$(curl -sf "$API/api/v1/report-executions?module_id=$MOD_ID" -H "$AUTH")
FCOUNT=$(echo "$FILTERED" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
[ "$FCOUNT" -ge 1 ] && ok "Module filter: $FCOUNT executions" || fail "Filter returned 0"

# 12. Verify output file
echo "=== Step 12: Verify output file ==="
OUTPUT_FULL=$(echo "$GEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('output_minio_path',''))")
OUTPUT_BUCKET=$(echo "$OUTPUT_FULL" | python3 -c "import sys; print(sys.stdin.read().strip().split('/',1)[0])")
OUTPUT_PATH=$(echo "$OUTPUT_FULL" | python3 -c "import sys; print(sys.stdin.read().strip().split('/',1)[1])")
python3 -c "
from minio import Minio
from openpyxl import load_workbook
client = Minio('$MINIO_HOST', access_key='$MINIO_USER', secret_key='$MINIO_PASS', secure=False)
client.fget_object('$OUTPUT_BUCKET', '$OUTPUT_PATH', '/tmp/test_out.xlsx')
wb = load_workbook('/tmp/test_out.xlsx')
ws = wb['Data']
assert ws['A4'].value is not None, 'A4 empty'
print(f'Headers: {ws[\"A4\"].value}, {ws[\"B4\"].value}, {ws[\"C4\"].value}')
print(f'Row 1: {ws[\"A5\"].value}, {ws[\"B5\"].value}')
assert 'Summary' in wb.sheetnames
print('File OK')
" && ok "Output verified" || fail "File verification failed"

# 13. Cleanup
echo "=== Step 13: Cleanup ==="
curl -sf "$API/api/v1/report-modules/delete?id=$MOD_ID" -H "$AUTH" -X POST > /dev/null \
  && ok "Module deleted" || fail "Delete failed"

echo ""
echo -e "${GREEN}=== All tests passed! ===${NC}"
