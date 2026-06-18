import { copyFile } from "node:fs/promises";

// Parcelで処理する必要のない検索エンジン向けファイルを、そのまま公開先へコピーする。
await Promise.all(
  ["robots.txt", "sitemap.xml"].map((fileName) =>
    copyFile(fileName, `dist/${fileName}`),
  ),
);
