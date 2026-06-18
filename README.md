# モジハカリ
Codexで作成。

シンプルに使える文字数・単語数カウンターです。

## 必要な環境

- Node.js 20以上
- npm

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

Parcelの開発サーバーが起動し、ファイルを変更するとブラウザへ自動的に反映されます。

## 本番ビルド

```bash
npm run build
```

HTML、CSS、JavaScriptを圧縮した本番用ファイルが `dist` ディレクトリに生成されます。開発用ソースのコメントや余白は変更されません。

## Azure Static Web Apps

Azure Static Web Appsのビルド設定では、次の値を使用します。

```yaml
app_location: "/"
output_location: "dist"
app_build_command: "npm run build"
```

Azure側では `npm install` に相当する依存関係のインストールがビルド前に自動実行されます。

## 主な機能

- 書記素単位の文字数カウント（絵文字や結合文字に対応）
- 空白を除いた文字数
- 日本語・英語の単語数
- 行数、段落数、文の数、UTF-8バイト数
- 推定読了時間
- 目標文字数と進捗バー
- コピー、貼り付け、クリア
- ブラウザへの下書き自動保存
- レスポンシブ表示
