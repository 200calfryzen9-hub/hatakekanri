# 畑しごと

スマホとPCで共有する農作業管理アプリです。Next.js を Vercel へ、データとログインを Supabase へ配置します。

## 公開手順

1. Supabase でプロジェクトを作り、SQL Editor から `supabase/schema.sql` を実行する。
2. Supabase の Authentication で Email を有効にし、URL Configuration の Site URL に Vercel のURLを設定する。
3. Vercel に GitHub リポジトリを Import し、環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定する。
4. `main` ブランチへ push すると Vercel が公開する。

最初の利用者は農場を作成します。画面に表示される共有コードを、参加する作業者へ渡してください。各作業者はメールアドレスでアカウント作成後、そのコードで農場に参加します。

## スマホへのインストール

公開済みの Vercel URL をスマホで開きます。Android の Chrome ではメニューから「アプリをインストール」、iPhone の Safari では共有ボタンから「ホーム画面に追加」を選びます。アイコンから起動でき、ブラウザのアドレスバーを表示しないアプリ画面で利用できます。
