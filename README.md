# The Snake Room

ローカル Docker コンテナ上で動作するボールパイソン飼育管理 Web アプリです。
ブラウザで `http://localhost:3000` にアクセスして使います。

## このリポジトリについて

- フロントエンドの詳細は `ROADMAP.md` を参照してください。
- このリポジトリは Finaltable-Hub / SnakeRoom からフォークして作成しました。

## HelloDocker

- Java 21 / 17 ベースの Spring Boot 3 アプリです (アプリケーションは `--release` で 21 または 17 を選べます)。
- Maven を使ってビルドと実行を行います。

## 必要条件

- Java 17 以上 (アプリケーションで 21 を使う場合は 21 以上)
- Maven 3.8 以上

## ビルド

プロジェクトのルートで次のコマンドを実行します。

```
mvn clean package
```

## 実行

次のコマンドでアプリケーションを起動します。

```
java -jar target/*.jar
```

## 動作確認

ブラウザで <http://localhost:8080> を開き、表示されることを確認します。

## その他
