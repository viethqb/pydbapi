#!/usr/bin/env sh
# Test gateway with 20 concurrent requests (Bearer auth).
# Usage: ./scripts/test_concurrent.sh [BASE_URL]
# Or:    TOKEN="your-jwt" ./scripts/test_concurrent.sh

BASE_URL="${1:-http://localhost:8000}"
TOKEN="${TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzAwMjMwNTAsInN1YiI6InBjeF9Wdm1WY0V5azJRWlp5dU1ISkEifQ.zR5RQ8NP2-OqWLqktrQzvpULRkHUP_0lwO3_YAJ97ig}"
URL="${BASE_URL}/module1/api/v1/test/sleep"
CONCURRENT=20
export TOKEN URL
echo "Testing ${CONCURRENT} concurrent GET requests to ${URL}"
echo "---"

seq 1 "$CONCURRENT" | xargs -n1 -P"$CONCURRENT" -I{} sh -c 'code=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$URL"); echo "{} HTTP $code"'

echo "---"
echo "Done. 429 = rate limit (req/min); 503 = over max concurrent limit."
