// content.js

class NoTranscriptError extends Error {
  constructor(message = "Transcript not found") {
    super(message);
    this.name = "NoTranscriptError";
  }
}
class TimeoutError extends Error {
  constructor(message = "Timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * selectorが現れるまで待つ（MutationObserver）
 */
function waitForSelector(selector, { timeoutMs = 10000, root = document } = {}) {
  const found = root.querySelector(selector);
  if (found) return Promise.resolve(found);

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      observer.disconnect();
      reject(new TimeoutError(`waitForSelector timeout: ${selector}`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        clearTimeout(t);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

function safeClick(el) {
  if (!el) return false;
  try {
    el.scrollIntoView({ block: "center", inline: "center" });
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * TranscriptのセグメントDOMからテキストを抽出して \n で結合
 */
function readTranscriptFromDom() {
  const segmentSelector = "ytd-transcript-segment-renderer";
  const segments = Array.from(document.querySelectorAll(segmentSelector));
  if (!segments.length) return null;

  // 本文らしいセレクタ優先（YouTubeのUI差分に備えて複数候補）
  const textSelectors = [
    "ytd-transcript-segment-renderer #segment-text",
    "ytd-transcript-segment-renderer yt-formatted-string.segment-text",
    "ytd-transcript-segment-renderer yt-formatted-string"
  ];

  let nodes = [];
  for (const sel of textSelectors) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length) {
      nodes = found;
      if (sel.includes("#segment-text") || sel.includes(".segment-text")) break;
    }
  }

  const lines = nodes
    .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    // タイムスタンプだけの行を除外（不要なら消してOK）
    .filter((t) => !/^\d{1,2}:\d{2}(\s|$)/.test(t));

  return lines.join("\n");
}

/**
 * 1) すでにTranscriptが開いているなら読む
 * 2) 指定クラスのボタンを探してクリック（誤爆防止で文言チェック）
 * 3) ダメなら「…」メニュー経由で Transcript をクリック
 */
async function openTranscriptPanel() {
  // すでに表示済みならOK
  const already = readTranscriptFromDom();
  if (already !== null) return;

  // --- 2) 指定クラスのボタンを探す ---
  const directBtnSelector =
    ".yt-spec-button-shape-next.yt-spec-button-shape-next--outline.yt-spec-button-shape-next--call-to-action";

  const directButtons = Array.from(document.querySelectorAll(directBtnSelector));
  const directBtn = directButtons.find((b) => {
    const txt = (b.textContent || "").trim();
    const aria = (b.getAttribute("aria-label") || "").trim();
    // 日本語/英語の揺れに対応
    return /文字起こし|トランスクリプト|Transcript|Show transcript/i.test(txt) ||
           /Transcript|Show transcript/i.test(aria);
  });

  if (directBtn && safeClick(directBtn)) {
    await sleep(1000); // 指定どおり待つ
    return;
  }

  // --- 3) 「…」メニューから開く（安定フォールバック） ---
  const menuBtn =
    document.querySelector('button[aria-label*="その他の操作"]') ||
    document.querySelector('button[aria-label*="More actions"]') ||
    document.querySelector('ytd-menu-renderer button[aria-label]');

  if (!menuBtn || !safeClick(menuBtn)) {
    throw new NoTranscriptError("Transcriptボタンが見つかりません（メニューも開けません）");
  }

  await waitForSelector("ytd-menu-service-item-renderer", { timeoutMs: 8000 });

  const items = Array.from(document.querySelectorAll("ytd-menu-service-item-renderer"));
  const transcriptItem = items.find((it) => {
    const t = (it.textContent || "").replace(/\s+/g, " ").trim();
    return /文字起こし|トランスクリプト|Show transcript|Transcript/i.test(t);
  });

  if (!transcriptItem || !safeClick(transcriptItem)) {
    throw new NoTranscriptError("メニュー内にTranscript項目が見つかりません（字幕未提供の可能性）");
  }

  await sleep(1000); // 指定どおり待つ
}

async function getTranscriptAsTextByDom() {
  // すでに開いてたら読む
  const initial = readTranscriptFromDom();
  if (initial !== null) {
    if (!initial.trim()) throw new NoTranscriptError("Transcriptは表示されていますが内容が空です");
    return initial;
  }

  await openTranscriptPanel();

  // セグメントが現れるまで待つ（1秒待っても遅延することがあるため）
  await waitForSelector("ytd-transcript-segment-renderer", { timeoutMs: 12000 });

  const text = readTranscriptFromDom();
  if (text === null) throw new NoTranscriptError("Transcriptパネルは開けましたがセグメントが見つかりません");
  if (!text.trim()) throw new NoTranscriptError("Transcriptは取得できましたが内容が空でした");
  return text;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "GET_TRANSCRIPT") return;

      const transcript = await getTranscriptAsTextByDom();
      sendResponse({ ok: true, transcript });
    } catch (e) {
      if (e instanceof NoTranscriptError) {
        sendResponse({ ok: false, error: { type: "NO_TRANSCRIPT", message: e.message } });
        return;
      }
      if (e instanceof TimeoutError) {
        sendResponse({ ok: false, error: { type: "TIMEOUT", message: e.message } });
        return;
      }
      sendResponse({
        ok: false,
        error: { type: "UNEXPECTED", message: e?.message ?? String(e), stack: e?.stack }
      });
    }
  })();

  return true; // async sendResponse
});
