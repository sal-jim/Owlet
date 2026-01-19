# Testing

## Unit tests (default)
- `pnpm test`

## Live tests (hits Twitter/X)

Runs the CLI against real Twitter/X GraphQL endpoints to verify read-only commands still work.

Requirements:
- Auth cookies in env:
  - `AUTH_TOKEN` (or `TWITTER_AUTH_TOKEN`)
  - `CT0` (or `TWITTER_CT0`)
- Network access

Run:
- `pnpm test:live`
- `pnpm bird following --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm bird list-timeline <list-id> --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm bird search "from:steipete" --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm bird home --count 5 --json --cookie-source chrome --chrome-profile Default`
- `pnpm bird home --count 5 --following --json --cookie-source chrome --chrome-profile Default`

Notes:
- Live tests are skipped unless `BIRD_LIVE=1` (set by `pnpm test:live`).
- Search query is configurable via `BIRD_LIVE_SEARCH_QUERY`.
- About account handle is configurable via `BIRD_LIVE_ABOUT_HANDLE`.
- Command timeout is configurable via `BIRD_LIVE_TIMEOUT_MS` (ms).
- Cookie extraction timeout is configurable via `BIRD_LIVE_COOKIE_TIMEOUT_MS` (ms).
- Spawned CLI `NODE_ENV` defaults to `production` (override with `BIRD_LIVE_NODE_ENV`).
- If you don't tweet, set `BIRD_LIVE_TWEET_ID` to a known tweet ID to use for `read/replies/thread`.
- Long-form article coverage: set `BIRD_LIVE_LONGFORM_TWEET_ID` to a known article tweet ID (example: `2007184284944322584` from @X; refresh by finding a tweet with `article` via `bird user-tweets X -n 20 --json`).
- Optional: set `BIRD_LIVE_BOOKMARK_FOLDER_ID` to exercise `bookmarks --folder-id`.
- `bird query-ids --fresh` live coverage: set `BIRD_LIVE_QUERY_IDS_FRESH=1`.
- The live suite may hit internal X endpoints (v1.1 REST) as fallback; it still uses cookie auth (no developer API key).
