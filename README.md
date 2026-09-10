# Link Dialog for kintone

kintoneアプリ内のリンククリックを、ページ遷移ではなくダイアログ(iframe)表示に差し替えるChrome/Edge拡張機能です。サイボウズ株式会社の公式製品ではない、非公式の個人開発ツールです。

- リポジトリ: https://github.com/hc-satoshiwatanabe/chrome-extention
- プライバシーポリシー: [PRIVACY.md](PRIVACY.md)（公開URL: https://github.com/hc-satoshiwatanabe/chrome-extention/blob/main/PRIVACY.md ）

## インストール(Chrome / Edge共通・開発者モード)

1. `chrome://extensions`(Edgeは`edge://extensions`)を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このリポジトリのフォルダを選択する
4. kintoneのページを開き直す(既に開いているタブはリロードが必要)

## 使い方

- kintone内のリンクをクリックすると、画面中央にダイアログでリンク先が表示されます
- アプリの一覧画面(`/k/<appId>/`)をダイアログで開いた場合、ヘッダー左側にそのアプリの一覧(ビュー)を切り替えるプルダウンが表示されます(kintoneのREST API `views.json` から動的に取得しているため、どのアプリでも共通で動作します)
- ダイアログ右上の「新しいタブで開く」で通常のタブ表示に切り替え可能
- ダイアログ外側のクリック、または`Esc`キーで閉じます
- 拡張機能アイコンをクリックすると、機能のON/OFFを切り替えられます(デフォルトON)

## 対象ドメインの変更

`manifest.json`の`content_scripts[0].matches`で対象ドメインを指定しています。デフォルトは以下です。

```json
"matches": [
  "https://*.cybozu.com/*",
  "https://*.kintone.com/*"
]
```

独自ドメイン(カスタムドメイン)でkintoneを利用している場合は、このパターンにそのドメインを追加してください。変更後は`chrome://extensions`の当該拡張機能で「再読み込み」を行ってください。

## 既知の制約

- リンク先が`X-Frame-Options`や`CSP(frame-ancestors)`でiframe埋め込みを拒否している外部サイトの場合、ダイアログ内が白紙になることがあります。その場合はダイアログの「新しいタブで開く」を使ってください。
- `Ctrl`/`Cmd`/`Shift`/`Alt`を押しながらのクリック、ファイルダウンロードリンク(`download`属性)、`javascript:`/`#`/`mailto:`/`tel:`リンクは従来どおりの挙動のままです(ダイアログ化しません)。
- URLに`/space`または`/portal`を含むリンク(スペース・ポータル画面)は、ダイアログ化せず通常どおり同じタブで遷移します。
- kintone自体の「クリックジャッキング対策」機能により、ダイアログ(iframe)内ではkintone標準の一覧選択サイドバーは表示されません(参考: [kintone公式ヘルプ - Embedding Kintone screen in other web sites](https://get.kintone.help/general/en/admin/list_externalservices/cj_protection.html))。この拡張機能では、その代わりにダイアログヘッダーへ独自の一覧切り替えプルダウンを実装することで回避しています。
- 一覧切り替えプルダウンは`views.json` APIの読み取り権限が必要です。アプリの閲覧権限があれば通常は問題なく動作します。
- kintoneの画面リニューアル等でDOM構造が変わった場合、動作しなくなる可能性があります。
