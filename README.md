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
- kintoneの画面リニューアル等でDOM構造が変わった場合、動作しなくなる可能性があります。
