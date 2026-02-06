const by = (sel, root = document) => root.querySelector(sel);
const all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const demoSnippets = {
  news: `owlet news -n 10`,
  read: `owlet read https://x.com/user/status/1234567890123456789`,
  thread: `owlet thread 1234567890123456789`,
  search: `owlet search "from:steipete" -n 5`,
  mentions: `owlet mentions -n 5`,
  bookmarks: `owlet bookmarks -n 5`,
};

const setDemo = (key) => {
  const code = by("#demoCode");
  if (!code) return;
  const value = demoSnippets[key] ?? demoSnippets.news;
  code.textContent = value;
};

const wireTabs = () => {
  const buttons = all("[data-cmd]");
  if (buttons.length === 0) return;
  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.getAttribute("data-cmd") ?? "news";
      buttons.forEach((x) => {
        const on = x === b;
        x.classList.toggle("is-on", on);
        x.setAttribute("aria-selected", on ? "true" : "false");
      });
      setDemo(key);
    });
  });
};

const wireCopy = () => {
  all("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sel = btn.getAttribute("data-copy");
      if (!sel) return;
      const node = by(sel);
      if (!node) return;
      const text = node.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add("is-done");
        window.setTimeout(() => btn.classList.remove("is-done"), 900);
      } catch {
        // noop
      }
    });
  });
};

const wireOrbs = () => {
  const a = by(".bg__orb--a");
  const b = by(".bg__orb--b");
  if (!a || !b) return;

  let raf = 0;
  const onMove = (e) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      a.style.transform = `translate3d(${(x - 0.4) * 80}px, ${(y - 0.4) * 70}px, 0)`;
      b.style.transform = `translate3d(${(x - 0.6) * 90}px, ${(y - 0.6) * 80}px, 0)`;
    });
  };

  window.addEventListener("mousemove", onMove, { passive: true });
};

document.documentElement.classList.add("js");
window.setTimeout(() => document.body.classList.add("is-ready"), 20);

wireTabs();
wireCopy();
wireOrbs();
