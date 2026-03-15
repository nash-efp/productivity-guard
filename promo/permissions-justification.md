# Chrome Web Store 権限・単一用途の説明

---

## 単一用途の説明（Single Purpose Description）

**日本語**
```
指定したウェブサイトの1日の閲覧時間を計測し、設定した上限に達したときにアクセスをブロックする時間管理ツールです。
```

**英語**
```
A time management tool that tracks daily browsing time on specified websites and blocks access when the user-defined limit is reached.
```

---

## 権限の説明

### `storage`

**日本語**
```
各サイトの利用時間・制限設定・バイパス状態・カスタムサイト一覧をユーザーの端末にローカル保存するために使用します。外部サーバーへのデータ送信は一切行いません。
```

**英語**
```
Used to store daily usage time, per-site limit settings, bypass states, and the list of custom sites locally on the user's device. No data is ever sent to external servers.
```

---

### `alarms`

**日本語**
```
Manifest V3 のサービスワーカーはブラウザによって任意のタイミングで停止されます。chrome.alarms を使用することで、サービスワーカーが停止していても毎日深夜0時に確実にバックグラウンド処理を実行します。具体的には以下の3つの処理を行います。

1. 期限切れのバイパス状態（一時解除）の自動クリア
2. 「今日だけOFF」設定の自動リセット（日付をまたいだとき）
3. 30日以上前の利用履歴データの自動削除

これらの処理はユーザーのプライバシー保護とデータ整合性の維持を目的としており、通知の送信や外部通信は一切行いません。
```

**英語**
```
In Manifest V3, service workers can be terminated by the browser at any time. The alarms API ensures that background maintenance tasks run reliably at midnight every day, even if the service worker is inactive. Specifically, the midnight alarm performs three tasks:

1. Automatically clears expired bypass states (temporary unblocks).
2. Resets the "skip confirmation today" setting when the day rolls over.
3. Removes usage history data older than 30 days to limit storage usage.

These tasks are purely for data integrity and privacy protection. No notifications are sent and no external communication occurs.
```

---

### `tabs`

**日本語**
```
1日の利用時間が上限に達したとき、対象タブをブロック画面にリダイレクトするために現在のタブ情報（URL・タブID）を取得します。タブの内容を読み取ったり、ユーザーの閲覧履歴を収集することはありません。
```

**英語**
```
Used to retrieve the current tab's URL and ID in order to redirect the tab to the block page when the daily time limit is reached. The extension does not read tab content or collect browsing history.
```

---

### `scripting`

**日本語**
```
ユーザーがポップアップからカスタムサイトを追加したとき、そのサイト専用のコンテンツスクリプトを動的に登録するために使用します。事前に登録できない任意のサイトを監視するために必要であり、ユーザーが許可を付与したサイトにのみ適用されます。
```

**英語**
```
Used to dynamically register a content script for each custom site the user adds via the popup. This is necessary to monitor arbitrary sites that cannot be declared in advance in the manifest. Scripts are only registered for sites the user has explicitly granted permission for.
```

---

## ホスト権限の説明

### 静的ホスト権限（インストール時に要求）

| パターン | 対象サイト | 理由 |
|---|---|---|
| `*://*.youtube.com/*` | YouTube | デフォルトの監視対象サイト |
| `*://*.twitter.com/*` | Twitter | デフォルトの監視対象サイト |
| `*://*.x.com/*` | X（旧Twitter） | twitter.com のエイリアスドメイン |

**日本語**
```
YouTube・Twitter・X はこの拡張機能のデフォルト監視対象です。ページ読み込み開始時（document_start）にコンテンツスクリプトを挿入し、閲覧時間の計測と上限到達時のブロック処理を行うために必要です。これらのサイト上でページの内容を読み取ったり変更したりすることはなく、時間計測とタブのリダイレクトのみを目的としています。
```

**英語**
```
YouTube, Twitter, and X are the default monitored sites. Host permissions for these domains are required to inject the time-tracking content script at document_start. The extension does not read or modify the content of these pages — it only measures time spent and redirects the tab to a block page when the limit is reached.
```

---

### オプションホスト権限 `<all_urls>`（ユーザー操作時に要求）

**日本語**
```
ユーザーがポップアップの「サイト管理」からカスタムサイト（例: instagram.com）を追加するとき、そのサイトへのアクセス許可をその都度 Chrome のダイアログを通じてリクエストします。

<all_urls> はマニフェストの optional_host_permissions に宣言していますが、インストール時には一切要求されません。ユーザーがサイトを追加する操作をした瞬間にのみ、追加対象の1サイトの権限を個別にリクエストします。サイトを削除すると、そのサイトの権限も自動的に返却されます。

コンテンツスクリプトは chrome.scripting.registerContentScripts() を使って動的に登録されるため、ユーザーが許可したサイトにのみ適用されます。
```

**英語**
```
When a user adds a custom site (e.g., instagram.com) via the "Site Manager" in the popup, the extension requests host permission for that specific site through Chrome's native permission dialog.

Although <all_urls> is declared in optional_host_permissions, it is never requested at install time. Permission is requested only at the moment the user clicks "Add", and only for the one site being added. Removing a site from the list automatically revokes its host permission.

Content scripts are registered dynamically via chrome.scripting.registerContentScripts() and apply only to sites the user has explicitly permitted.
```

---

## リモートコードの不使用について

**日本語**
```
この拡張機能はリモートコードを一切使用していません。すべてのスクリプトは拡張機能パッケージ内に含まれており、外部URLからコードを読み込むことはありません。fetch() や XMLHttpRequest による外部通信も行っていません。
```

**英語**
```
This extension does not use any remote code. All scripts are bundled within the extension package. No code is loaded from external URLs, and no external network requests (fetch / XMLHttpRequest) are made.
```
