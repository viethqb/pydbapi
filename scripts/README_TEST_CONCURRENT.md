# Test concurrent limit (max_concurrent)

## 1. Create an API that runs ~10 seconds (so requests stay in flight)

In the Frontend (or DB):

- **Module**: e.g. `test` (path prefix `/test`)
- **API**: path `sleep`, method GET
- **Content (SQL)**: `SELECT pg_sleep(10), 1 AS x`
- Publish the API and assign it to the client used for testing.

Gateway URL will look like: `http://localhost:8000/test/sleep`

## 2. Client configuration

- **max_concurrent**: `1`
- **rate_limit_per_minute**: leave empty (or ≥ 20) to avoid 429 during the test.

## 3. Run the script

```bash
# Requires requests
pip install requests

# Test 20 concurrent requests; 1 gets 200, 19 get 503
python scripts/test_concurrent.py \
  --url "http://localhost:8000/test/sleep" \
  --token "YOUR_JWT" \
  --concurrent 20
```

Or use env vars:

```bash
export TOKEN="your-jwt"
export GATEWAY_URL="http://localhost:8000/test/sleep"
export CONCURRENT=20
python scripts/test_concurrent.py
```

**Expected:** 1 × HTTP 200 (after ~10s), 19 × HTTP 503.
