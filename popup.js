const copyBtn = document.getElementById("copyBtn");
const statusEl = document.getElementById("status");
const debugWrap = document.getElementById("debugWrap");
const debugEl = document.getElementById("debug");

function setStatus(text, kind = "none") {
  statusEl.textContent = text;
  statusEl.classList.remove("error", "ok");
  if (kind === "error") statusEl.classList.add("error");
  if (kind === "ok") statusEl.classList.add("ok");
}

function setDebug(text) {
  if (!text) {
    debugWrap.style.display = "none";
    debugEl.textContent = "";
    return;
  }
  debugWrap.style.display = "block";
  debugEl.textContent = text;
}

function isWatchUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes("youtube.com") &&
      u.pathname === "/watch" &&
      !!u.searchParams.get("v")
    );
  } catch {
    return false;
  }
}

function prettyErrorMessage(err) {
  const type = err?.type;

  if (type === "NO_TRANSCRIPT") {
    return "Transcriptが見つかりません（字幕が提供されていない動画です）";
  }
  if (type === "TIMEOUT") {
    return "Transcriptの表示がタイムアウトしました。少し待ってから再実行してください。";
  }
  if (type === "SEND_MESSAGE_FAILED") {
    return "このページでは実行できません。再度動画を読み込んでから試してください。";
  }
  if (type === "NO_RESPONSE") {
    return "Transcript取得に失敗しました（応答なし）。再度動画を読み込んでから試してください。";
  }
  return "エラーが発生しました。詳細を確認してください。";
}

copyBtn.addEventListener("click", async () => {
  setDebug("");
  setStatus("取得中…");
  copyBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? "";

    if (!isWatchUrl(url)) {
      setStatus("YouTubeの動画ページ（watch?v=...）で実行してください。", "error");
      return;
    }

    // content scriptへTranscript取得依頼
    let res;
    try {
      res = await chrome.tabs.sendMessage(tab.id, { type: "GET_TRANSCRIPT" });
    } catch (e) {
      const errObj = {
        type: "SEND_MESSAGE_FAILED",
        message: e?.message ?? String(e),
        stack: e?.stack
      };
      setStatus(prettyErrorMessage(errObj), "error");
      setDebug(JSON.stringify(errObj, null, 2));
      return;
    }

    if (!res) {
      const errObj = { type: "NO_RESPONSE" };
      setStatus(prettyErrorMessage(errObj), "error");
      setDebug(JSON.stringify(errObj, null, 2));
      return;
    }

    if (!res.ok) {
      setStatus(prettyErrorMessage(res.error), "error");
      setDebug(JSON.stringify(res?.error ?? { type: "UNKNOWN_ERROR" }, null, 2));
      return;
    }

    // 取得成功ルート
    const transcript = res.transcript ?? "";

    // ※区別したい要件に合わせて「取得成功だが空」も別メッセージにする
    if (!transcript.trim()) {
      const errObj = { type: "EMPTY_TRANSCRIPT", length: transcript.length };
      setStatus("Transcriptは取得できましたが内容が空でした（形式変更/表示不具合の可能性）", "error");
      setDebug(JSON.stringify(errObj, null, 2));
      return;
    }

    // clipboardへコピー
    try {
      await navigator.clipboard.writeText(transcript);
      setStatus("コピーしました ✅", "ok");
    } catch (e) {
      const errObj = {
        type: "CLIPBOARD_WRITE_FAILED",
        message: e?.message ?? String(e),
        stack: e?.stack
      };
      setStatus("再度動画を読み込んでから試してください", "error");
      setDebug(JSON.stringify(errObj, null, 2));
    }
  } catch (e) {
    const errObj = { type: "UNEXPECTED", message: e?.message ?? String(e), stack: e?.stack };
    setStatus("エラーが発生しました。詳細を確認してください。", "error");
    setDebug(JSON.stringify(errObj, null, 2));
  } finally {
    copyBtn.disabled = false;
  }
});
