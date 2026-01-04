# 全体の処理の流れ (2026-01-04)

## 目的
YouTube のトランスクリプトをページ内から取得し、拡張のポップアップからクリップボードにコピーする Chrome 拡張の挙動確認とコード解説。

## 主要ファイル
- manifest.json — 拡張定義（content_scripts, permissions, popup）
- popup.html — 拡張ポップアップの UI
- popup.js — ポップアップの操作・メッセージ送受信・クリップボード書込
- content.js — YouTube ページ内でトランスクリプトを開き抽出するロジック

## イベント登録〜実行の順序（要点）
1. watch ページ読み込み → content.js が挿入され chrome.runtime.onMessage リスナーを登録。
2. 拡張アイコンで popup を開く → popup.js が実行されボタンに click リスナーを登録。
3. ボタン押下 → popup がアクティブタブを取得し URL を検証。
4. popup から content script に sendMessage({type: "GET_TRANSCRIPT"})。
5. content.js が受信 → getTranscriptAsTextByDom() を実行。
6. 既存の DOM を確認、なければボタン or メニューから Transcript パネルを開く（safeClick / waitForSelector を使用）。
7. セグメント要素を取得してテキスト抽出 → sendResponse で結果を返す。
8. popup 側でレスポンス受信 → 成功なら clipboard.writeText、失敗ならエラー表示。

## 各処理で行っている主な操作（短縮）
- waitForSelector: MutationObserver で指定要素の出現を待つ（タイムアウト対応）。
- safeClick: スクロール・マウスイベント dispatch・click で UI 操作を安定させる。
- readTranscriptFromDom: ytd-transcript-segment-renderer からテキスト行を抽出し改行で結合。
- openTranscriptPanel: 直接ボタン検出→クリック。失敗時は「…」メニュー経由で項目をクリック。
- popup.js: タブ取得・URL チェック・sendMessage・レスポンス処理・クリップボード書込・ステータス表示。

## フローチャート（mermaid）
```mermaid
flowchart TD
  A[YouTube watch ページ読み込み] --> B[content.js を挿入・評価]
  B --> C[chrome.runtime.onMessage リスナー登録]
  C --> D[（待機）]

  E[拡張アイコンをクリック → popup 開く] --> F[popup.js 実行: ボタン等を初期化]
  F --> G[ユーザーが「Transcriptをコピー」ボタンをクリック]
  G --> H[アクティブタブを取得して URL チェック]
  H -->|NG| H2[エラ表示: watch?v=... で実行してください]
  H -->|OK| I[content script へ sendMessage({type: "GET_TRANSCRIPT"})]

  I --> J[content.js の onMessage 受信]
  J --> K[getTranscriptAsTextByDom() 実行]
  K --> L{readTranscriptFromDom で既に取得できる？}
  L -->|Yes| M[テキストを返す]
  L -->|No| N[openTranscriptPanel() を実行]
  N --> N1[直接ボタンを探して safeClick]
  N1 --> N2[失敗 → 「…」メニューを開きメニュー項目を safeClick]
  N2 --> O[セグメント要素の出現を待つ]
  O --> P[readTranscriptFromDom でテキスト抽出]
  P --> M

  M --> Q[sendResponse({ok: true, transcript})]
  Q --> R[popup 側でレスポンス受信]
  R --> S{res.ok ?}
  S -->|No| T[エラーメッセージ表示・debug 出力]
  S -->|Yes| U[navigator.clipboard.writeText(transcript) を実行]
  U --> V[成功: 「コピーしました ✅」表示]
  U --> W[失敗: クリップボード書込失敗のエラー表示・debug 出力]

  T --> X[finally: ボタンを再有効化]
  V --> X
  W --> X
```

必要なら別ファイル名や追加情報（関数単位の詳細説明など）を指定してください。
