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
- `pnpm run owlet:cli -- following --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm run owlet:cli -- list-timeline <list-id> --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm run owlet:cli -- search "from:steipete" --all --max-pages 2 --json --cookie-source chrome --chrome-profile Default`
- `pnpm run owlet:cli -- home --count 5 --json --cookie-source chrome --chrome-profile Default`
- `pnpm run owlet:cli -- home --count 5 --following --json --cookie-source chrome --chrome-profile Default`

Notes:
- Live tests are skipped unless `OWLET_LIVE=1` (set by `pnpm test:live`).
- Search query is configurable via `OWLET_LIVE_SEARCH_QUERY`.
- Follow/unfollow handle is configurable via `OWLET_LIVE_FOLLOW_HANDLE` (opt-in).
- Command timeout is configurable via `OWLET_LIVE_TIMEOUT_MS` (ms).
- Cookie extraction timeout is configurable via `OWLET_LIVE_COOKIE_TIMEOUT_MS` (ms).
- Spawned CLI `NODE_ENV` defaults to `production` (override with `OWLET_LIVE_NODE_ENV`).
- If you don't tweet, set `OWLET_LIVE_TWEET_ID` to a known tweet ID to use for `read/replies/thread`.
- Long-form article coverage: set `OWLET_LIVE_LONGFORM_TWEET_ID` to a known article tweet ID (example: `2007184284944322584` from @X; refresh by finding a tweet with `article` via `owlet user-tweets X -n 20 --json`).
- Optional: set `OWLET_LIVE_BOOKMARK_FOLDER_ID` to exercise `bookmarks --folder-id`.
- `owlet query-ids --fresh` live coverage: set `OWLET_LIVE_QUERY_IDS_FRESH=1`.
- The live suite may hit internal X endpoints (v1.1 REST) as fallback; it still uses cookie auth (no developer API key).
