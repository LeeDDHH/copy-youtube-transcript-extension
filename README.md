# copy-youtube-transcript-extension

YouTube動画の文字起こし（Transcript）をクリップボードにコピーするChrome拡張機能です。

## インストール方法

### 開発版のインストール

1. このリポジトリをクローンまたはダウンロード
   ```bash
   git clone https://github.com/riazumaken/copy-youtube-transcript.git
   cd copy-youtube-transcript
   ```

2. Chromeで `chrome://extensions` を開く

3. 右上の「デベロッパーモード」を有効にする

4. 「パッケージ化されていない拡張機能を読み込む」をクリック

5. このディレクトリを選択

## 使い方

1. YouTube動画ページ（字幕が利用可能な動画）を開く

2. 拡張機能アイコンをクリック

3. 「Transcriptをコピー」ボタンをクリック

4. クリップボードにTranscriptがコピーされます

## 注意事項

- 字幕が提供されていない動画では動作しません
- YouTube側のUI変更により動作しなくなる可能性があります

## 全体的な流れ

```mermaid
flowchart TD
  A[YouTube watch ページ読み込み] --> B[content.js を挿入・評価]
  B --> C[chrome.runtime.onMessage リスナー登録]
  C --> D[（待機）]

  E[拡張アイコンをクリック → popup 開く] --> F[popup.js 実行: ボタン等を初期化]
  F --> G[ユーザーが「Transcriptをコピー」ボタンをクリック]
  G --> H[アクティブタブを取得して URL チェック]
  H -->|NG| H2[エラ表示: watch?v=... で実行してください]
  H -->|OK| I[content script へ sendMessageのtypeが GET_TRANSCRIPT として送信]

  I --> J[content.js の onMessage 受信]
  J --> K[getTranscriptAsTextByDom 実行]
  K --> L{readTranscriptFromDom で既に取得できる？}
  L -->|Yes| M[テキストを返す]
  L -->|No| N[openTranscriptPanel を実行]
  N --> N1[直接ボタンを探して safeClick]
  N1 --> N2[失敗 → 「…」メニューを開きメニュー項目を safeClick]
  N2 --> O[セグメント要素 ytd-transcript-segment-renderer の出現を待つ]
  O --> P[readTranscriptFromDom でセグメントからテキスト抽出]
  P --> M

  M --> Q[sendResponseの値をok: true, transcriptにして実行]
  Q --> R[popup 側でレスポンス受信]
  R --> S{res.ok ?}
  S -->|No| T[エラーメッセージ表示・debug 出力]
  S -->|Yes| U[navigator.clipboard.writeTextにtranscript を実行]
  U --> V[成功: 「コピーしました ✅」表示]
  U --> W[失敗: クリップボード書込失敗のエラー表示・debug 出力]

  T --> X[finally: ボタンを再有効化]
  V --> X
  W --> X
```
