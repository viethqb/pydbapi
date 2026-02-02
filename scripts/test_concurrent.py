#!/usr/bin/env python3
"""
Test gateway concurrent limit: send N requests in parallel with Bearer auth.

To test max_concurrent=1:
  1. Create an API that runs ~10s (e.g. module "test", path "sleep", SQL: SELECT pg_sleep(10), 1 AS x).
  2. Set client max_concurrent=1 (and optionally clear rate_limit_per_minute for that client).
  3. Run: python scripts/test_concurrent.py --url http://localhost:8000/test/sleep --token YOUR_JWT

Expected: 1x HTTP 200 (after ~10s), 19x HTTP 503.

Usage:
  python scripts/test_concurrent.py [--url URL] [--token TOKEN] [--concurrent N]
  Or set env: GATEWAY_URL, TOKEN, CONCURRENT
"""

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(1)


def do_request(
    url: str,
    token: str,
    index: int,
) -> tuple[int, int]:
    """Send one GET request; return (index, status_code)."""
    try:
        r = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        return (index, r.status_code)
    except Exception as e:
        return (index, -1)  # -1 = error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test gateway concurrent limit with N parallel requests."
    )
    parser.add_argument(
        "--url",
        default=os.environ.get(
            "GATEWAY_URL", "http://localhost:8000/module1/api/v1/test"
        ),
        help="Gateway URL (use an API that runs ~10s for concurrent test, e.g. SQL: SELECT pg_sleep(10), 1)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("TOKEN", ""),
        help="Bearer token (or set TOKEN env)",
    )
    parser.add_argument(
        "--concurrent",
        type=int,
        default=int(os.environ.get("CONCURRENT", "20")),
        help="Number of concurrent requests (default 20)",
    )
    args = parser.parse_args()

    if not args.token:
        print("Error: --token or TOKEN env required", file=sys.stderr)
        sys.exit(1)

    print(f"Testing {args.concurrent} concurrent GET requests to {args.url}")
    print("---")

    results: list[tuple[int, int]] = []
    with ThreadPoolExecutor(max_workers=args.concurrent) as executor:
        futures = {
            executor.submit(do_request, args.url, args.token, i): i
            for i in range(1, args.concurrent + 1)
        }
        for fut in as_completed(futures):
            idx, code = fut.result()
            results.append((idx, code))
            code_str = str(code) if code >= 0 else "ERR"
            print(f"{idx} HTTP {code_str}")

    results.sort(key=lambda x: x[0])
    print("---")
    ok = sum(1 for _, c in results if c == 200)
    five_three = sum(1 for _, c in results if c == 503)
    four_two_nine = sum(1 for _, c in results if c == 429)
    err = sum(1 for _, c in results if c < 0)
    print(f"Done. 200={ok} 503={five_three} 429={four_two_nine} errors={err}")
    print("503 = over max concurrent limit; 429 = rate limit (req/min).")


if __name__ == "__main__":
    main()
