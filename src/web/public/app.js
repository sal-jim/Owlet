const form = document.getElementById('editionForm');
const statusEl = document.getElementById('status');
const edition = document.getElementById('edition');
const editionPaper = document.getElementById('editionPaper');
const issueDate = document.getElementById('issueDate');
const clearForm = document.getElementById('clearForm');

issueDate.textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, max = 180) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatNumber(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }
  return Intl.NumberFormat('en-US').format(value);
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function gatherFormPayload() {
  const formData = new FormData(form);
  const tabs = formData.getAll('tab').map((entry) => String(entry));
  const cookieSource = formData.getAll('cookieSource').map((entry) => String(entry));

  return {
    query: String(formData.get('query') || '').trim(),
    news: {
      count: Number(formData.get('newsCount') || 16),
      tabs,
      aiOnly: formData.get('aiOnly') === 'on',
      withTweets: formData.get('withTweets') === 'on',
      tweetsPerItem: Number(formData.get('tweetsPerItem') || 3),
      includeTrending: tabs.includes('trending'),
    },
    topic: {
      count: Number(formData.get('topicCount') || 12),
    },
    classifieds: {
      enabled: formData.get('classifieds') === 'on',
      count: Number(formData.get('classifiedCount') || 10),
    },
    auth: {
      authToken: String(formData.get('authToken') || '').trim() || undefined,
      ct0: String(formData.get('ct0') || '').trim() || undefined,
      chromeProfile: String(formData.get('chromeProfile') || '').trim() || undefined,
      firefoxProfile: String(formData.get('firefoxProfile') || '').trim() || undefined,
      cookieSource: cookieSource.length > 0 ? cookieSource : undefined,
    },
  };
}

function renderThemes(themes) {
  if (!themes || themes.length === 0) {
    return '<p class="note">No dominant themes detected.</p>';
  }
  return themes.map((theme) => `<span class="theme">${escapeHtml(theme)}</span>`).join('');
}

function renderNotes(notes) {
  if (!notes || notes.length === 0) return '';
  return `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
}

function renderStories(items) {
  if (!items || items.length === 0) {
    return '<p class="note">No headlines available.</p>';
  }
  return items
    .map((item) => {
      const meta = [item.category, item.timeAgo, item.postCount ? `${formatNumber(item.postCount)} posts` : null]
        .filter(Boolean)
        .join(' · ');
      const desc = item.description ? `<p class="story__desc">${escapeHtml(item.description)}</p>` : '';
      const link = item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.headline)}</a>` : escapeHtml(item.headline);
      return `
        <article class="story">
          <h3>${link}</h3>
          <div class="story__meta">${escapeHtml(meta || 'Headline')}</div>
          ${desc}
        </article>
      `;
    })
    .join('');
}

function renderDispatches(tweets) {
  if (!tweets || tweets.length === 0) {
    return '<p class="note">No dispatches found.</p>';
  }
  return tweets
    .map((tweet) => {
      const url = `https://x.com/${tweet.author.username}/status/${tweet.id}`;
      const meta = `@${tweet.author.username} · ${formatTime(tweet.createdAt)}`;
      return `
        <div class="dispatch">
          <div class="dispatch__title">${escapeHtml(truncate(tweet.text, 200))}</div>
          <div class="dispatch__meta"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(meta)}</a></div>
        </div>
      `;
    })
    .join('');
}

function renderTrends(items) {
  if (!items || items.length === 0) {
    return '<p class="note">No trend wire today.</p>';
  }
  return items
    .map((item) => {
      const right = item.postCount ? `${formatNumber(item.postCount)} posts` : item.timeAgo || '';
      return `
        <div class="trend">
          <span>${escapeHtml(item.headline)}</span>
          <span class="note">${escapeHtml(right)}</span>
        </div>
      `;
    })
    .join('');
}

function renderClassifieds(items) {
  if (!items || items.length === 0) {
    return '<p class="note">No listings today.</p>';
  }
  return items
    .map((tweet) => {
      const url = `https://x.com/${tweet.author.username}/status/${tweet.id}`;
      const meta = `${tweet.author.name} (@${tweet.author.username})`;
      return `
        <div class="classified">
          <div class="dispatch__title">${escapeHtml(truncate(tweet.text, 140))}</div>
          <div class="classified__meta"><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(meta)}</a></div>
        </div>
      `;
    })
    .join('');
}

function buildEditionMarkup(editionData) {
  const headline = editionData.headline || {};
  const headlineImage = headline.imageUrl
    ? `<img src="${escapeHtml(headline.imageUrl)}" alt="Headline" />`
    : `<img src="./assets/owlet-plate.svg" alt="Owlet plate" />`;
  const headlineMeta = [headline.category, headline.timeAgo].filter(Boolean).join(' · ');
  const headlineSummary = headline.summary ? `<p class="lead__summary">${escapeHtml(headline.summary)}</p>` : '';

  const topicDesk = editionData.topic
    ? `
      <section class="section">
        <div class="section__header">
          <h2>Topic Desk</h2>
          <span>${escapeHtml(editionData.topic.query)}</span>
        </div>
        <div class="briefing">
          <div class="briefing__themes">${renderThemes(editionData.topic.themes)}</div>
        </div>
        <div class="dispatches">${renderDispatches(editionData.topic.tweets)}</div>
      </section>
    `
    : '';

  return `
    <div class="edition-grid fade-in">
      <section>
        <div class="lead">
          <div class="lead__media">${headlineImage}</div>
          <div class="lead__copy">
            <div class="lead__kicker">Front Page</div>
            <h1>${escapeHtml(headline.title || 'Owlet Daily')}</h1>
            <div class="lead__meta">${escapeHtml(headlineMeta || 'Compiled from X Explore')}</div>
            ${headlineSummary}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__header">
          <h2>Morning Briefing</h2>
          <span>Signals and notes</span>
        </div>
        <div class="briefing">
          <div>
            <strong>Themes</strong>
            <div class="briefing__themes">${renderThemes(editionData.briefing.themes)}</div>
          </div>
          <div>
            <strong>Notes</strong>
            ${renderNotes(editionData.briefing.notes)}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__header">
          <h2>Top Stories</h2>
          <span>${editionData.news.length} headlines</span>
        </div>
        <div class="columns">${renderStories(editionData.news)}</div>
      </section>

      ${topicDesk}

      <section class="section">
        <div class="section__header">
          <h2>Trend Wire</h2>
          <span>${editionData.trends.length} items</span>
        </div>
        <div class="trends">${renderTrends(editionData.trends)}</div>
      </section>

      <section class="section">
        <div class="section__header">
          <h2>Classifieds</h2>
          <span>Hiring and open roles</span>
        </div>
        <div class="classifieds">
          <div class="classifieds__column">
            <h3>Hiring</h3>
            ${renderClassifieds(editionData.classifieds.hiring)}
          </div>
          <div class="classifieds__column">
            <h3>Open to work</h3>
            ${renderClassifieds(editionData.classifieds.seeking)}
          </div>
        </div>
      </section>
    </div>
  `;
}

async function submitEdition(event) {
  event.preventDefault();
  statusEl.textContent = 'Printing edition...';

  try {
    const payload = gatherFormPayload();
    const response = await fetch('/api/edition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!data.ok) {
      statusEl.textContent = data.error || 'Failed to build edition.';
      return;
    }

    if (data.warnings && data.warnings.length > 0) {
      statusEl.textContent = data.warnings.join(' ');
    } else {
      statusEl.textContent = 'Edition ready.';
    }

    editionPaper.innerHTML = buildEditionMarkup(data.edition);
    edition.hidden = false;
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : 'Failed to build edition.';
  }
}

form.addEventListener('submit', submitEdition);

clearForm.addEventListener('click', () => {
  form.reset();
  statusEl.textContent = 'Ready to compile.';
  edition.hidden = true;
});
