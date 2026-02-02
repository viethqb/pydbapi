# Concurrent limit logic (max concurrent per client)

## 1. Gateway flow

Each request to `/{module}/{path}` goes through:

1. **Firewall** → 403 if blocked
2. **Resolve** module + API → 404 if not found
3. **Auth** (if API is private) → 401 if no/invalid token
4. **client_key** = `app_client.client_id` (if client) or `f"ip:{ip}"` (public API)
5. **Concurrent (acquire)** → 503 if over allowed slots
6. **Rate limit** → 429 if over req/min (and **release** the slot just acquired)
7. **parse_params** → **runner_run** (run SQL/Script) in a **thread pool** (`asyncio.to_thread`)
8. **finally: release_concurrent_slot(client_key)** (always called when leaving handler)

**Note:** `runner_run` is sync/blocking. If called directly in the async handler the event loop is blocked → only one request at a time → concurrent limit never exceeds 1 (acquire always ok). So the gateway calls `runner_run` via `asyncio.to_thread` so multiple requests can be in flight and the limit works correctly.

Order: **concurrent before rate limit** — a request over the concurrent limit gets 503 immediately and is not counted toward rate limit.

---

## 2. Limit value used for concurrent

- **client_key**: Identifies the client (client_id or ip).
- **client_max**:
  - If `app_client` exists and `app_client.max_concurrent` is set (value > 0) → use **client_max = app_client.max_concurrent**.
  - Otherwise → use **global** `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT` (default 10).
- If **effective limit ≤ 0** (global=0 and no override > 0): no limit (acquire always succeeds, counter not incremented).

---

## 3. Acquire (take one slot)

**File:** `backend/app/core/gateway/concurrent.py` → `acquire_concurrent_slot(client_key, max_concurrent_override)`

- **Redis (when used):**
  - Key: `concurrent:gateway:{client_key}`
  - `INCR` key → if `n > max_c` then `DECR` and return `False` (503), else return `True`.
  - On first use (n=1): set `EXPIRE` key 300s to avoid stale keys after process crash.
- **In-memory (when no Redis):**
  - Dict `_memory[client_key]` = number of slots in use.
  - If `n >= max_c` → return `False`, else `n += 1` and return `True`.
- **Fail-open:** Redis error or no Redis → treat as allow (use in-memory or skip limit).

Note: **In-memory is not shared across processes.** With multiple workers (e.g. uvicorn 4 workers), each worker has its own counter → effective limit = max_concurrent × number of workers. Use **Redis** for correct limit with multiple workers.

---

## 4. Release (return one slot)

**Function:** `release_concurrent_slot(client_key)`

- Always called in the **finally** block of the gateway handler (after acquire), including when returning 429 (after rate limit) or 5xx errors.
- **Redis:** `DECR` key `concurrent:gateway:{client_key}`.
- **In-memory:** `_memory[key] -= 1`; if ≤ 0 remove key.

Bug fix: previously when **global** `FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT = 0`, release did not call DECR → slot was never returned when the client had its own **max_concurrent** override. Changed to **always release** (always DECR / decrement \_memory) when calling `release_concurrent_slot`.

---

## 5. Debug concurrent (stdout)

Set env **CONCURRENT_DEBUG=1** (e.g. in docker-compose backend: `CONCURRENT_DEBUG=1`) then send a gateway request. Check logs:

```bash
docker compose logs backend --tail 50
```

You should see lines like:

- `[concurrent] no limit max_c=0 override=None global=0 ...` → limit is off (check .env / FLOW_CONTROL_MAX_CONCURRENT_PER_CLIENT and client max_concurrent).
- `[concurrent] acquire client_key=... max_c=10 redis=True ok=True` → limit in use, Redis, acquire succeeded.

If you see no `[concurrent]` lines → the request may not be going through the gateway (check URL: must be `/{module}/{path}` e.g. `/module1/api/v1/test`).

---

## 6. Verifying concurrent behaviour

1. **DB has `max_concurrent` column:**  
   Run migration `006_max_concurrent_client` (or equivalent), ensure table `app_client` has column `max_concurrent`.

2. **Client has limit = 1:**  
   In Frontend (or DB): the client used for testing has **max_concurrent = 1**, **rate_limit_per_minute** empty or large (e.g. ≥ 20) to avoid 429.

3. **API runs for ~10s:**  
   Use an API with SQL like `SELECT pg_sleep(10), 1 AS x` so requests stay in flight longer and 503 is easy to observe.

4. **Single worker or Redis:**
   - Single worker: in-memory is enough to test (1 slot = 1 request).
   - Multiple workers: need Redis for shared count; otherwise you will see more 200s than expected (limit per worker).

5. **Test:**  
   Send 20 concurrent requests with that client’s Bearer token.  
   Expected: **1 × 200**, **19 × 503** (if max_concurrent=1 and rate limit does not block).

---

## 7. Summary

| Component      | Meaning                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| **client_key** | `client_id` (with auth) or `ip:{ip}` (public).                             |
| **client_max** | `AppClient.max_concurrent` if set > 0, else global.                        |
| **Acquire**    | INCR (Redis) or +1 in-memory; if over limit → 503.                         |
| **Release**    | Always DECR / -1 in **finally** (and when returning 429 after rate limit). |
| **In-memory**  | Correct only for one process; multiple workers need Redis.                 |
| **503**        | Over allowed concurrent requests (max concurrent).                         |
