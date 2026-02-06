import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCliContext } from '../cli/shared.js';
import { TwitterClient } from '../lib/twitter-client.js';
import type { NewsItem, TweetData } from '../lib/twitter-client.js';
import type { ExploreTab } from '../lib/twitter-client-news.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC_DIR = resolve(ROOT, 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'have',
  'has',
  'your',
  'you',
  'are',
  'but',
  'not',
  'was',
  'were',
  'will',
  'just',
  'about',
  'into',
  'over',
  'after',
  'before',
  'than',
  'their',
  'they',
  'them',
  'our',
  'out',
  'who',
  'why',
  'how',
  'what',
  'when',
  'where',
  'its',
  'via',
  'new',
  'now',
  'today',
  'latest',
  'says',
  'say',
  'said',
  'more',
]);

const DEFAULT_NEWS_TABS: ExploreTab[] = ['forYou', 'news', 'sports', 'entertainment'];

const MAX_NEWS_COUNT = 40;
const MAX_TOPIC_COUNT = 40;
const MAX_CLASSIFIED_COUNT = 30;
const MAX_TWEETS_PER_ITEM = 6;

const ctx = createCliContext([]);

type EditionRequest = {
  query?: string;
  news?: {
    count?: number;
    tabs?: ExploreTab[];
    aiOnly?: boolean;
    withTweets?: boolean;
    tweetsPerItem?: number;
    includeTrending?: boolean;
  };
  topic?: {
    count?: number;
  };
  classifieds?: {
    enabled?: boolean;
    count?: number;
  };
  auth?: {
    authToken?: string;
    ct0?: string;
    cookieSource?: string[] | string;
    chromeProfile?: string;
    firefoxProfile?: string;
    cookieTimeoutMs?: number;
  };
  timeoutMs?: number;
  quoteDepth?: number;
};

type Headline = {
  title: string;
  url?: string;
  category?: string;
  timeAgo?: string;
  imageUrl?: string;
  summary?: string;
};

type EditionResponse = {
  ok: boolean;
  warnings?: string[];
  error?: string;
  edition?: {
    title: string;
    date: string;
    query?: string;
    headline?: Headline;
    briefing: {
      themes: string[];
      notes: string[];
    };
    news: NewsItem[];
    trends: NewsItem[];
    topic: {
      query: string;
      tweets: TweetData[];
      themes: string[];
    } | null;
    classifieds: {
      hiring: TweetData[];
      seeking: TweetData[];
    };
  };
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseCookieSources(input: unknown): ('safari' | 'chrome' | 'firefox')[] | undefined {
  const allowed = new Set(['safari', 'chrome', 'firefox']);
  if (!input) {
    return undefined;
  }
  if (Array.isArray(input)) {
    const filtered = input.filter((source) => typeof source === 'string' && allowed.has(source));
    return filtered.length > 0 ? (filtered as ('safari' | 'chrome' | 'firefox')[]) : undefined;
  }
  if (typeof input === 'string' && allowed.has(input)) {
    return [input as 'safari' | 'chrome' | 'firefox'];
  }
  return undefined;
}

function normalizeTabs(tabs?: ExploreTab[]): ExploreTab[] {
  if (!tabs || tabs.length === 0) {
    return [...DEFAULT_NEWS_TABS];
  }
  const allowed = new Set<ExploreTab>(['forYou', 'news', 'sports', 'entertainment', 'trending']);
  const filtered = tabs.filter((tab) => allowed.has(tab));
  return filtered.length > 0 ? filtered : [...DEFAULT_NEWS_TABS];
}

function compactTweet(tweet: TweetData): TweetData {
  return {
    id: tweet.id,
    text: tweet.text,
    author: tweet.author,
    authorId: tweet.authorId,
    createdAt: tweet.createdAt,
    replyCount: tweet.replyCount,
    retweetCount: tweet.retweetCount,
    likeCount: tweet.likeCount,
    conversationId: tweet.conversationId,
    inReplyToStatusId: tweet.inReplyToStatusId,
    quotedTweet: undefined,
    media: tweet.media,
    article: tweet.article,
  };
}

function compactNewsItem(item: NewsItem): NewsItem {
  return {
    id: item.id,
    headline: item.headline,
    category: item.category,
    timeAgo: item.timeAgo,
    postCount: item.postCount,
    description: item.description,
    url: item.url,
    tweets: item.tweets?.map(compactTweet),
  };
}

function extractThemes(texts: string[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = text
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-zA-Z0-9#\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);

    for (const token of tokens) {
      const normalized = token.startsWith('#') ? token.slice(1) : token;
      if (!normalized || STOP_WORDS.has(normalized)) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function pickHeadline(news: NewsItem[], topicTweets: TweetData[] | undefined): Headline | undefined {
  for (const item of news) {
    const candidateTweet = item.tweets?.find((tweet) => tweet.media && tweet.media.length > 0);
    if (candidateTweet) {
      const media = candidateTweet.media?.[0];
      const imageUrl = media?.previewUrl || media?.url;
      if (imageUrl) {
        return {
          title: item.headline,
          url: item.url,
          category: item.category,
          timeAgo: item.timeAgo,
          imageUrl,
          summary: item.description,
        };
      }
    }
  }

  if (news.length > 0) {
    const fallback = news[0];
    return {
      title: fallback.headline,
      url: fallback.url,
      category: fallback.category,
      timeAgo: fallback.timeAgo,
      summary: fallback.description,
    };
  }

  for (const tweet of topicTweets ?? []) {
    const media = tweet.media?.[0];
    const imageUrl = media?.previewUrl || media?.url;
    if (imageUrl) {
      return {
        title: tweet.text,
        url: `https://x.com/${tweet.author.username}/status/${tweet.id}`,
        category: 'Topic Desk',
        imageUrl,
      };
    }
  }

  return undefined;
}

async function buildEdition(payload: EditionRequest): Promise<EditionResponse> {
  const tabs = normalizeTabs(payload.news?.tabs);
  let includeTrending = payload.news?.includeTrending ?? tabs.includes('trending');
  let newsTabs: ExploreTab[] = tabs.filter((tab) => tab !== 'trending');
  if (newsTabs.length === 0 && includeTrending) {
    newsTabs = ['trending'];
    includeTrending = false;
  }

  const newsCount = clamp(payload.news?.count ?? 16, 4, MAX_NEWS_COUNT);
  const topicCount = clamp(payload.topic?.count ?? 12, 4, MAX_TOPIC_COUNT);
  const classifiedCount = clamp(payload.classifieds?.count ?? 10, 3, MAX_CLASSIFIED_COUNT);
  const tweetsPerItem = clamp(payload.news?.tweetsPerItem ?? 3, 1, MAX_TWEETS_PER_ITEM);

  const cookieSource = parseCookieSources(payload.auth?.cookieSource);

  const { cookies, warnings } = await ctx.resolveCredentialsFromOptions({
    authToken: payload.auth?.authToken,
    ct0: payload.auth?.ct0,
    cookieSource,
    chromeProfile: payload.auth?.chromeProfile,
    firefoxProfile: payload.auth?.firefoxProfile,
    cookieTimeout: payload.auth?.cookieTimeoutMs,
  });

  if (!cookies.authToken || !cookies.ct0) {
    return {
      ok: false,
      warnings,
      error: 'Missing required credentials. Provide auth_token/ct0 or login to x.com in a supported browser.',
    };
  }

  const timeoutMs = ctx.resolveTimeoutFromOptions({ timeout: payload.timeoutMs });
  const quoteDepth = ctx.resolveQuoteDepthFromOptions({ quoteDepth: payload.quoteDepth });
  const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });

  const newsPromise = client.getNews(newsCount, {
    tabs: newsTabs.length > 0 ? newsTabs : DEFAULT_NEWS_TABS,
    aiOnly: payload.news?.aiOnly ?? false,
    withTweets: payload.news?.withTweets ?? true,
    tweetsPerItem,
    includeRaw: false,
  });

  const query = payload.query?.trim();
  const topicPromise = query
    ? client.search(`${query} -filter:retweets`, topicCount, { includeRaw: false })
    : Promise.resolve({ success: true as const, tweets: [] });

  const hiringQuery =
    '(hiring OR "we are hiring" OR "looking to hire" OR "job opening" OR "job openings" OR "join our team") -filter:retweets';
  const seekingQuery =
    '("open to work" OR "looking for work" OR "seeking opportunities" OR "seeking role" OR "available for work") -filter:retweets';

  const classifiedsEnabled = payload.classifieds?.enabled ?? true;

  const hiringPromise = classifiedsEnabled
    ? client.search(hiringQuery, classifiedCount, { includeRaw: false })
    : Promise.resolve({ success: true as const, tweets: [] });

  const seekingPromise = classifiedsEnabled
    ? client.search(seekingQuery, classifiedCount, { includeRaw: false })
    : Promise.resolve({ success: true as const, tweets: [] });

  const trendingPromise = includeTrending
    ? client.getNews(Math.min(12, newsCount), {
        tabs: ['trending'],
        aiOnly: false,
        withTweets: false,
        includeRaw: false,
      })
    : Promise.resolve({ success: true as const, items: [] });

  const [newsResult, topicResult, hiringResult, seekingResult, trendingResult] = await Promise.all([
    newsPromise,
    topicPromise,
    hiringPromise,
    seekingPromise,
    trendingPromise,
  ]);

  if (!newsResult.success) {
    return { ok: false, warnings, error: newsResult.error };
  }

  const news = newsResult.items.map(compactNewsItem);
  const topicTweets = topicResult.success ? topicResult.tweets.map(compactTweet) : [];
  const hiringTweets = hiringResult.success ? hiringResult.tweets.map(compactTweet) : [];
  const seekingTweets = seekingResult.success ? seekingResult.tweets.map(compactTweet) : [];
  const trends = trendingResult.success ? trendingResult.items.map(compactNewsItem) : [];

  const briefingThemes = extractThemes(news.map((item) => item.headline));
  const topicThemes = extractThemes(topicTweets.map((tweet) => tweet.text));

  const notes = [
    `Coverage: ${news.length} headlines across ${newsTabs.length > 0 ? newsTabs.join(', ') : 'default tabs'}.`,
  ];

  if (payload.news?.aiOnly) {
    notes.push('AI-curated filter enabled.');
  }
  if (query) {
    notes.push(`Topic desk: "${query}" (${topicTweets.length} posts).`);
  }
  if (classifiedsEnabled) {
    notes.push(`Classifieds: ${hiringTweets.length} hiring, ${seekingTweets.length} seeking.`);
  }

  const headline = pickHeadline(news, topicTweets);

  return {
    ok: true,
    warnings,
    edition: {
      title: 'Owlet Daily',
      date: new Date().toISOString(),
      query: query || undefined,
      headline,
      briefing: {
        themes: briefingThemes,
        notes,
      },
      news,
      trends,
      topic: query
        ? {
            query,
            tweets: topicTweets,
            themes: topicThemes,
          }
        : null,
      classifieds: {
        hiring: hiringTweets,
        seeking: seekingTweets,
      },
    },
  };
}

async function readRequestJson(req: IncomingMessage): Promise<EditionRequest> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body) as EditionRequest);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: EditionResponse) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, payload: string) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(payload);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url) {
    return false;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${cleanPath}`);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return false;
    }
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendText(res, 400, 'Bad request');
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/edition')) {
    try {
      const payload = await readRequestJson(req);
      const response = await buildEdition(payload);
      sendJson(res, response.ok ? 200 : 400, response);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return;
  }

  if (req.method === 'GET') {
    const handled = await serveStatic(req, res);
    if (handled) {
      return;
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: 'Unknown API endpoint' });
    return;
  }

  if (req.method === 'GET') {
    const fallbackPath = join(PUBLIC_DIR, 'index.html');
    try {
      const html = await readFile(fallbackPath, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    } catch {
      // ignore
    }
  }

  sendText(res, 404, 'Not found');
});

const port = Number(process.env.OWLET_PORT ?? process.env.HAWK_PORT ?? process.env.PORT ?? 4173);
const host = process.env.OWLET_HOST ?? process.env.HAWK_HOST ?? '127.0.0.1';

server.listen(port, host, () => {
  console.log(`Owlet web UI running at http://${host}:${port}`);
});
