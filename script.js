// 入力欄や設定欄など、操作に使用するHTML要素を取得する。
const textInput = document.querySelector("#text-input");
const charLimitInput = document.querySelector("#char-limit");
const saveDraftInput = document.querySelector("#save-draft");
const saveStatus = document.querySelector("#save-status");
const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const themeColor = document.querySelector('meta[name="theme-color"]');
const toast = document.querySelector("#toast");

// カウント結果を表示する要素をまとめて管理する。
const output = {
  chars: document.querySelector("#char-count"),
  noSpaces: document.querySelector("#no-space-count"),
  words: document.querySelector("#word-count"),
  lines: document.querySelector("#line-count"),
  paragraphs: document.querySelector("#paragraph-count"),
  sentences: document.querySelector("#sentence-count"),
  bytes: document.querySelector("#byte-count"),
  readingTime: document.querySelector("#reading-time"),
};

const progress = document.querySelector("#limit-progress");
const progressBar = document.querySelector("#limit-bar");

// 数値を「1,000」のような日本語向けの形式で表示する。
const numberFormat = new Intl.NumberFormat("ja-JP");

// Intl.Segmenterを使い、文字・単語・文の境界を言語に応じて判定する。
// 対応していないブラウザでは、各関数内の代替処理を使用する。
const graphemeSegmenter =
  "Segmenter" in Intl
    ? new Intl.Segmenter("ja", { granularity: "grapheme" })
    : null;
const wordSegmenter =
  "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;
const sentenceSegmenter =
  "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "sentence" })
    : null;

let toastTimer;
let saveTimer;

const themes = ["system", "light", "dark"];
const themeNames = {
  system: "端末設定",
  light: "ライト",
  dark: "ダーク",
};

/**
 * 選択したテーマを画面へ反映し、テーマ切り替えボタンの説明を更新する。
 * 端末設定の場合はdata属性を外し、OSの配色設定へ追従する。
 */
function applyTheme(theme) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }

  const currentIndex = themes.indexOf(theme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  themeLabel.textContent = themeNames[theme];
  themeToggle.title = `表示テーマ：${themeNames[theme]}`;
  themeToggle.setAttribute(
    "aria-label",
    `表示テーマ：${themeNames[theme]}。クリックして${themeNames[nextTheme]}モードに変更`,
  );
  themeColor.content = isDark ? "#171715" : "#f6f3ed";
}

function getSavedTheme() {
  try {
    const savedTheme = localStorage.getItem("mojihakari-theme");
    return themes.includes(savedTheme) ? savedTheme : "system";
  } catch {
    return "system";
  }
}

function saveTheme(theme) {
  try {
    if (theme === "system") {
      localStorage.removeItem("mojihakari-theme");
    } else {
      localStorage.setItem("mojihakari-theme", theme);
    }
  } catch {
    // テーマ設定を保存できなくても、現在のページでは切り替えを適用する。
  }
}

/**
 * 見た目上の文字数を数える。
 * 絵文字や濁点など、複数のUnicode文字で構成される文字も1文字として扱う。
 */
function countGraphemes(text) {
  return graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].length
    : Array.from(text).length;
}

/**
 * 空白や句読点を除き、単語として認識された部分を数える。
 * Intl.Segmenterが使えない場合は、文字と数字のまとまりを単語とみなす。
 */
function countWords(text) {
  if (!text.trim()) return 0;

  if (wordSegmenter) {
    return [...wordSegmenter.segment(text)].filter(
      (segment) => segment.isWordLike,
    ).length;
  }

  return (text.match(/[\p{L}\p{N}]+(?:['’ー-][\p{L}\p{N}]+)*/gu) || [])
    .length;
}

/**
 * 句点や改行などを基準に文の数を数える。
 */
function countSentences(text) {
  if (!text.trim()) return 0;

  if (sentenceSegmenter) {
    return [...sentenceSegmenter.segment(text)].filter((segment) =>
      segment.segment.trim(),
    ).length;
  }

  return text.split(/[。！？.!?\n]+/u).filter((part) => part.trim()).length;
}

/**
 * 日本語を1分500文字、英単語を1分200語として読了時間を推定する。
 * 日本語と英語が混在しても二重に数えないよう、それぞれを分けて集計する。
 */
function formatReadingTime(text) {
  if (!text.trim()) return "0秒";

  const japaneseCharacters =
    text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヵヶ]/gu)
      ?.length || 0;
  const englishWords =
    text.match(/[\p{Script=Latin}\p{N}]+(?:['’][\p{Script=Latin}\p{N}]+)*/gu)
      ?.length || 0;
  const minutes = japaneseCharacters / 500 + englishWords / 200;

  // 推定値であるため、細かすぎる表示を避けて5秒単位で切り上げる。
  const seconds = Math.max(5, Math.ceil((minutes * 60) / 5) * 5);
  if (seconds < 60) return `約${seconds}秒`;

  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const minutePart = remainingMinutes ? `${remainingMinutes}分` : "";
  const secondPart = remainingSeconds ? `${remainingSeconds}秒` : "";

  if (hours > 0) return `約${hours}時間${minutePart}${secondPart}`;
  return `約${remainingMinutes}分${secondPart}`;
}

/**
 * 現在の文字数と目標文字数を比較し、進捗バーを更新する。
 */
function updateLimit(chars) {
  const limit = Number.parseInt(charLimitInput.value, 10);
  if (!limit || limit < 1) {
    progress.hidden = true;
    return;
  }

  const percentage = (chars / limit) * 100;
  progress.hidden = false;
  progress.setAttribute("aria-valuenow", String(Math.min(100, percentage)));
  progressBar.style.width = `${Math.min(100, percentage)}%`;
  progress.classList.toggle("over", chars > limit);
  charLimitInput.setAttribute(
    "aria-label",
    `目標文字数 ${limit}文字、現在${chars}文字`,
  );
}

/**
 * 入力中の文章を解析し、画面上のすべての集計結果を更新する。
 */
function updateCounts() {
  const text = textInput.value;
  const chars = countGraphemes(text);
  const noSpaces = countGraphemes(text.replace(/\s/gu, ""));
  const words = countWords(text);
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const paragraphs = text
    ? text.split(/(?:\r\n|\r|\n){2,}/).filter((part) => part.trim()).length
    : 0;
  const sentences = countSentences(text);
  // TextEncoderは文字列をUTF-8へ変換するため、その配列長がバイト数になる。
  const bytes = new TextEncoder().encode(text).length;

  output.chars.textContent = numberFormat.format(chars);
  output.noSpaces.textContent = numberFormat.format(noSpaces);
  output.words.textContent = numberFormat.format(words);
  output.lines.textContent = numberFormat.format(lines);
  output.paragraphs.textContent = numberFormat.format(paragraphs);
  output.sentences.textContent = numberFormat.format(sentences);
  output.bytes.textContent = numberFormat.format(bytes);
  output.readingTime.textContent = formatReadingTime(text);
  updateLimit(chars);
}

/**
 * 下書き保存が有効な場合だけ、文章と目標文字数をlocalStorageへ保存する。
 */
function saveDraft() {
  if (!saveDraftInput.checked) return;

  try {
    localStorage.setItem("mojihakari-draft", textInput.value);
    localStorage.setItem("mojihakari-limit", charLimitInput.value);
    localStorage.setItem("mojihakari-save-enabled", "true");
    saveStatus.textContent = "保存しました";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveStatus.textContent = "このブラウザに自動保存";
    }, 1200);
  } catch {
    // 保存に失敗した場合は、安全側に倒して保存設定を無効にする。
    saveDraftInput.checked = false;
    removeSavedDraft();
    saveStatus.textContent = "保存できないため、保存しません";
  }
}

/**
 * 保存済みの入力内容と保存設定をlocalStorageから完全に削除する。
 */
function removeSavedDraft() {
  window.clearTimeout(saveTimer);

  try {
    localStorage.removeItem("mojihakari-draft");
    localStorage.removeItem("mojihakari-limit");
    localStorage.removeItem("mojihakari-save-enabled");
    saveStatus.textContent = "保存しません";
  } catch {
    saveStatus.textContent = "保存しません";
  }
}

// 操作結果を画面下部へ短時間表示する。
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 1800);
}

// クリップボードの文章を、入力欄のカーソル位置へ挿入する。
async function pasteText() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    textInput.setRangeText(
      clipboardText,
      textInput.selectionStart,
      textInput.selectionEnd,
      "end",
    );
    updateCounts();
    saveDraft();
    textInput.focus();
    showToast("貼り付けました");
  } catch {
    showToast("ブラウザの貼り付け許可を確認してください");
  }
}

// 入力中の文章をクリップボードへコピーする。
async function copyText() {
  if (!textInput.value) {
    showToast("コピーするテキストがありません");
    return;
  }

  try {
    await navigator.clipboard.writeText(textInput.value);
    showToast("コピーしました");
  } catch {
    // Clipboard APIが利用できない古いブラウザ向けの代替処理。
    textInput.select();
    document.execCommand("copy");
    showToast("コピーしました");
  }
}

// 文章が変更されるたびに、集計と下書き保存を行う。
textInput.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

// 目標文字数が変更されたときは進捗表示と設定を更新する。
charLimitInput.addEventListener("input", () => {
  updateLimit(countGraphemes(textInput.value));
  saveDraft();
});

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme || "system";
  const nextTheme =
    themes[(themes.indexOf(currentTheme) + 1) % themes.length];

  applyTheme(nextTheme);
  saveTheme(nextTheme);
});

// 端末設定を選択中は、OS側のテーマ変更にもリアルタイムで追従する。
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) applyTheme("system");
  });

// 保存を有効にした場合だけ現在の文章を保存し、無効にした瞬間に保存済みデータを削除する。
saveDraftInput.addEventListener("change", () => {
  if (saveDraftInput.checked) {
    saveStatus.textContent = "このブラウザに自動保存";
    saveDraft();
    showToast("ブラウザへの保存を有効にしました");
    return;
  }

  removeSavedDraft();
  showToast("保存済みの文章を削除しました");
});

document.querySelector("#paste-button").addEventListener("click", pasteText);
document.querySelector("#copy-button").addEventListener("click", copyText);
document.querySelector("#clear-button").addEventListener("click", () => {
  if (!textInput.value) return;
  textInput.value = "";
  updateCounts();
  saveDraft();
  textInput.focus();
  showToast("テキストをクリアしました");
});

// 明示的に保存を有効にした場合だけ、前回の下書きを復元する。
// 旧バージョンが保存したデータも、保存設定がなければ削除する。
try {
  const isSaveEnabled =
    localStorage.getItem("mojihakari-save-enabled") === "true";

  saveDraftInput.checked = isSaveEnabled;

  if (isSaveEnabled) {
    textInput.value = localStorage.getItem("mojihakari-draft") || "";
    charLimitInput.value = localStorage.getItem("mojihakari-limit") || "";
    saveStatus.textContent = "このブラウザに自動保存";
  } else {
    removeSavedDraft();
  }
} catch {
  saveStatus.textContent = "自動保存は利用できません";
}

// 保存しない設定では、履歴から戻った際に文章が復元されないようページ離脱時に入力欄を空にする。
window.addEventListener("pagehide", () => {
  if (saveDraftInput.checked) return;

  removeSavedDraft();
  textInput.value = "";
  charLimitInput.value = "";
});

// 初期表示時にも、復元した文章を含めて集計する。
applyTheme(getSavedTheme());
updateCounts();
