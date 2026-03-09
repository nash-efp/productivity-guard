# Productivity Guard

YouTube・Twitter/X の1日の利用時間を制限するChrome拡張機能（Manifest V3）。

## 機能

- **時間制限**: サイトごとに1日の上限時間を設定。超過するとブロックページへリダイレクト
- **バイパス**: ブロック画面から「+5分だけ見る」ボタンで一時的に解除
- **開く前に確認**: サイトを開こうとすると「本当に開きますか？」オーバーレイを表示し、無意識なアクセスを抑制
- **マスタースイッチ**: ポップアップ右上のトグルで拡張機能全体を即座にオン/オフ
- **統計**: 過去7日/30日の利用時間を横棒グラフで可視化（上限ライン付き）

## 対応サイト

- YouTube (`youtube.com`)
- Twitter / X (`twitter.com`, `x.com`)

## インストール

1. このリポジトリをクローン or ZIPダウンロード
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `time-limit-extension/` フォルダを選択

## ファイル構成

```
time-limit-extension/
├── manifest.json      # MV3設定・権限
├── background.js      # Service Worker（時間計測・ブロック・バイパス管理）
├── content.js         # コンテンツスクリプト（tick送信・確認オーバーレイ）
├── popup.html/js/css  # ポップアップUI
├── blocked.html/js/css  # ブロックページ
├── stats.html/js/css  # 統計ページ
└── images/            # アイコン
```

## データ構造 (chrome.storage.local)

```js
// サイト設定
settings: {
  "youtube.com": { limitMinutes: 20, enabled: true },
  "twitter.com": { limitMinutes: 20, enabled: true }
}

// 利用時間（秒、30日分保持）
usage: {
  "2026-03-10": { "youtube.com": 742, "twitter.com": 318 }
}

// バイパス状態
bypass: {
  "youtube.com": { grantedAt: 1741478400000, durationMs: 300000 }
}

// グローバル設定
masterEnabled: true        // 拡張機能のオン/オフ
confirmEnabled: true       // 開く前に確認のオン/オフ
```

## 動作確認

1. YouTubeを開き、拡張アイコンをクリックしてポップアップを確認
2. 上限を1分に設定 → 1分後にブロックページへリダイレクト
3. ブロックページの「今は見てもいい (+5分)」でバイパス動作を確認
4. ポップアップの統計リンクから過去データをグラフで確認

## 権限

| 権限 | 用途 |
|------|------|
| `storage` | 設定・利用時間の保存 |
| `tabs` | ブロック時のリダイレクト |
| `alarms` | 将来の拡張用 |
| `host_permissions` | youtube.com / twitter.com / x.com へのアクセス |
