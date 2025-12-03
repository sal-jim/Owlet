# bird 🐦 — fast X CLI for tweeting, replying, and reading

`bird` is a fast X CLI for tweeting, replying, and reading — powered by cookies or Sweetistics.

It keeps setup minimal while supporting common workflows for automation or scripting.

## Installation

```bash
cd ~/Projects/bird
pnpm install
pnpm run binary  # Creates the 'bird' executable
```

## Usage

### Commands at a glance
- `bird tweet "<text>"` — post a new tweet.
- `bird reply <tweet-id-or-url> "<text>"` — reply to a tweet using its ID or URL.
- `bird read <tweet-id-or-url> [--json]` — fetch tweet content as text or JSON.
- `bird replies <tweet-id-or-url> [--json]` — list replies to a tweet.
- `bird thread <tweet-id-or-url> [--json]` — show the full conversation thread.
- `bird search "<query>" [-n count] [--json]` — search for tweets matching a query.
- `bird mentions [-n count] [--json]` — find tweets mentioning @clawdbot.
- `bird whoami` — print which Twitter account your cookies belong to.
- `bird check` — show which credentials are available and where they were sourced from.

### Examples

```bash
# Show the logged-in account via GraphQL cookies
bird whoami

# Use Firefox profile cookies instead of Chrome
bird --firefox-profile default-release whoami

# Send a tweet
bird tweet "hello from bird"

# Check replies to a tweet
bird replies https://x.com/user/status/1234567890123456789
```

Transport (engine) selection:
- `--engine graphql|sweetistics|auto` (default `graphql`).
  - `sweetistics`: use Sweetistics API key, no browser cookies needed.
  - `graphql`: use Twitter/X GraphQL with cookies (Chrome/Firefox/env/flags).
  - `auto`: Sweetistics if an API key is available, otherwise GraphQL.

You can set persistent defaults via config files (JSON5):

- Global: `~/.config/bird/config.json5`
- Project: `./.birdrc.json5` (overrides global)

Example `~/.config/bird/config.json5` (Firefox + GraphQL defaults):

```json5
{
  engine: "graphql",
  // Prefer Firefox cookies by default
  firefoxProfile: "default-release",
  // Optional: Sweetistics defaults if you want fallback/overrides
  sweetisticsApiKey: "sweet-...",
  // Allow/deny cookie sources (both default to true)
  allowFirefox: true,
  // Disable Chrome cookies entirely (optional)
  allowChrome: false
}
```

Precedence: CLI flags > environment variables > project config > global config.

### Credential sources (macOS)

Used only when transport resolves to **graphql**:
- **Firefox (default)**: `~/Library/Application Support/Firefox/Profiles/<profile>/cookies.sqlite`. `--firefox-profile <name>` (defaults to `default-release` if present).
- **Chrome**: `~/Library/Application Support/Google/Chrome/<Profile>/Cookies` (WAL/SHM copied too). `--chrome-profile <name>`.
- **Env/flags** always override browser cookies.

Transport is chosen first; then, if transport is GraphQL, the cookie source is resolved with the same precedence.

Config precedence: CLI flags > environment variables > project config (`.birdrc.json5`) > global config (`~/.config/bird/config.json5`).
When `allowChrome` or `allowFirefox` is set to `false`, that source is skipped entirely during credential resolution.

### Post a tweet

```bash
bird tweet "Hello from bird!"
```

### Reply to a tweet

```bash
# Using tweet URL
bird reply "https://x.com/user/status/1234567890" "This is my reply"

# Using tweet ID directly
bird reply 1234567890 "This is my reply"
```

### Read a tweet

```bash
# Get tweet content by URL or ID
bird read "https://x.com/user/status/1234567890"
bird read 1234567890 --json
```

### Search tweets

```bash
# Search for tweets containing a query
bird search "claude AI" -n 10

# Search for mentions of a user
bird search "@clawdbot"
```

### Find mentions

```bash
# Shortcut to search for @clawdbot mentions
bird mentions -n 10
bird mentions --json
```

### Check credentials

```bash
bird check
```

## Authentication

`bird` resolves credentials in the following order of priority:

1. **CLI arguments** (highest priority)
   ```bash
   bird --auth-token "xxx" --ct0 "yyy" tweet "Hello"
   ```

2. **Environment variables**
   ```bash
   export AUTH_TOKEN="xxx"
   export CT0="yyy"
   bird tweet "Hello"
   ```

   Alternative env var names: `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`

3. **Chrome cookies** (fallback - macOS only)
   - Automatically extracts from Chrome's cookie database
   - Requires Chrome to be logged into x.com
   - May prompt for keychain access on first run

### Credential sources (macOS)

Used only when transport resolves to **graphql**:
- **Chrome (default)**: `~/Library/Application Support/Google/Chrome/<Profile>/Cookies` (WAL/SHM copied too). `--chrome-profile <name>`.
- **Firefox**: `~/Library/Application Support/Firefox/Profiles/<profile>/cookies.sqlite`. `--firefox-profile <name>` (defaults to `*.default-release` if present).
- **Env/flags** always override browser cookies.

Precedence: CLI flags > env vars > project config > global config. Transport is chosen first; then, if transport is GraphQL, cookie source is chosen.

### Posting via Sweetistics (API key)

If you have a Sweetistics API key, `bird` can post through the Sweetistics SaaS instead of using local Twitter cookies:

```bash
export SWEETISTICS_API_KEY="sweet-..."
bird tweet "Hello from Sweetistics!"

# Optional: point to a self-hosted instance
bird --sweetistics-base-url "http://localhost:3000" --sweetistics-api-key "sweet-..." tweet "hi"
```

When an API key is present, `bird` will use Sweetistics’ `/api/actions/tweet` endpoint and skip local cookie resolution.

### Getting Your Cookies

1. Open Chrome and log into x.com
2. Open DevTools (Cmd+Option+I)
3. Go to Application > Cookies > x.com
4. Copy the values for `auth_token` and `ct0`

## Development

```bash
# Run in development mode
pnpm run dev tweet "Test"

# Run tests
pnpm test

# Run linter
pnpm run lint

# Fix lint issues
pnpm run lint:fix
```

## Notes

- Chrome cookie extraction requires macOS (uses `sqlite3` and `security` CLI tools).
- The keychain access may block when running over SSH; use environment variables instead.
- Twitter/X rotates GraphQL query IDs; refresh them with `pnpm run graphql:update` (writes `src/lib/query-ids.json`).
