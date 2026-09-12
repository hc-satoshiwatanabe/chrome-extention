# ストア掲載用テキスト(ドラフト)

そのままコピー&ペーストして使えるように用意した下書きです。公開前に内容を確認・調整してください。

**v2.8.0時点の内容です。名称を「Link Dialog for kintone」から「kintone 経路マップ」に変更し、機能も一新しています。Edgeにはv1.0.0(旧ダイアログ機能)が公開済みのため、更新時は単なるマイナーアップデートではなく、単一の目的が根本的に変わった旨が伝わるよう申請時の説明に注意してください。**

## 拡張機能名

```
kintone 経路マップ
```

## 短い説明(Chrome Web Store: 132文字以内)

```
kintone内のページ遷移を自動記録し、経路マップ(マインドマップ)として可視化する非公式拡張機能です。
```

## 詳細説明

```
kintone(cybozu.com / kintone.com)を使っていると、一覧からレコードを開き、
関連レコードをたどり…と気づけば深い階層まで進んでいて、
どこから来たのか分からなくなることがあります。
本拡張機能は、そうしたページ遷移(kintoneアプリ内のSPA的な遷移、タブをまたいだ遷移も含む)を
自動的に記録し、ツリー図(マインドマップ)としていつでも振り返れるようにします。

■ 主な機能
・kintone内のページ遷移を自動的に記録(クリックだけでなく、戻る/進む・アドレスバー入力・
  ブックマークからの遷移も対象)
・Ctrl/Cmd/Shift/Altクリック・中クリック・target="_blank"やwindow.open()による
  新しいタブを開いた場合も、経路がつながって記録されます
・拡張機能アイコンの「経路マップを見る」から、記録した経路をツリー図で確認可能
  (マウスホイールでズーム、ドラッグでパン)
・ノードをクリックすると詳細ドロワーを表示。種別・レコード番号・記録日時・URLを確認でき、
  「新しいタブで開く」(同じURLのタブが開いていればアクティブにします)・
  「このノードを削除」が可能
・ノードにはURLの代わりにアプリ名・レコードのタイトル(取引先名など)を表示
  (kintoneのアプリ情報APIから取得)
・同じページに複数回たどり着いても重複ノードを作らず1つのノードに集約
・「履歴をクリア」でいつでも記録を消去可能
・拡張機能アイコンから記録のON/OFFを切り替え可能

■ ご注意
・本拡張機能はサイボウズ株式会社の公式製品ではありません。個人が開発した非公式ツールです。
・記録はURLの変化を検知する仕組みのため、まれに実質同じ画面を別ページとして記録することがあります。
・kintoneの画面仕様変更により、動作しなくなる可能性があります。

■ プライバシー
本拡張機能は、記録した経路やレコードの情報を外部に送信することは一切ありません。
経路データはお使いのブラウザ内にのみ保存されます。詳細はプライバシーポリシーをご参照ください。
```

## カテゴリ

- Chrome Web Store: 「生産性」(Productivity)
- Edge Add-ons: 「Productivity」

## 言語

日本語(主)。`_locales/en`も同梱しているため、英語の掲載情報も追加可能です。

## プライバシーポリシーURL

両ストアの申請フォームで、プライバシーポリシーのURLとして以下を入力してください。

```
https://github.com/hc-satoshiwatanabe/chrome-extention/blob/main/PRIVACY.md
```

## ソースコード / サポートURL

```
https://github.com/hc-satoshiwatanabe/chrome-extention
```

## 権限の説明(審査フォーム用)

```
storage justification:
Used only to persist a small amount of local state: whether path recording is
on/off, the recorded navigation graph itself, and a short-lived cross-tab
handoff value. Nothing is transmitted anywhere.

tabs justification:
Used so that clicking a node in the path map (or "open in new tab") can focus
an already-open tab with that exact URL instead of creating a duplicate one.

host permission justification (*.cybozu.com / *.kintone.com):
Used to detect page navigation within kintone (including in-app SPA route
changes) in order to record it as a node in the user's local path map, and to
call kintone's own REST API (using the user's existing session) to resolve a
human-readable app name / record title for each node instead of a raw URL.
```

## スクリーンショット

`docs/mockup_map.html`(このリポジトリに同梱)を実ブラウザで開き、`Win+Shift+S`等でキャプチャしたものを使用してください。ダミーデータのみで、実際の会社のkintone画面は使用していません。
