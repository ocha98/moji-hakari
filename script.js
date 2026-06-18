// 入力欄や設定欄など、操作に使用するHTML要素を取得する。
const textInput = document.querySelector("#text-input");
const charLimitInput = document.querySelector("#char-limit");
const saveStatus = document.querySelector("#save-status");
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
 */
function formatReadingTime(chars, words) {
  if (chars === 0) return "0秒";

  const japaneseLike = Math.max(0, chars - words);
  const minutes = japaneseLike / 500 + words / 200;
  const seconds = Math.max(1, Math.ceil(minutes * 60));

  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `約${Math.ceil(seconds / 60)}分`;
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.ceil((seconds % 3600) / 60);
  return `${hours}時間${remainingMinutes ? `${remainingMinutes}分` : ""}`;
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
  output.readingTime.textContent = formatReadingTime(chars, words);
  updateLimit(chars);
}

/**
 * 下書きと目標文字数を、このブラウザのlocalStorageへ保存する。
 * サーバーへの送信は行わない。
 */
function saveDraft() {
  try {
    localStorage.setItem("mojihakari-draft", textInput.value);
    localStorage.setItem("mojihakari-limit", charLimitInput.value);
    saveStatus.textContent = "保存しました";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveStatus.textContent = "この端末に自動保存";
    }, 1200);
  } catch {
    saveStatus.textContent = "自動保存は利用できません";
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

// 前回保存した下書きと目標文字数があれば復元する。
try {
  textInput.value = localStorage.getItem("mojihakari-draft") || "";
  charLimitInput.value = localStorage.getItem("mojihakari-limit") || "";
} catch {
  saveStatus.textContent = "自動保存は利用できません";
}

// 初期表示時にも、復元した文章を含めて集計する。
updateCounts();
