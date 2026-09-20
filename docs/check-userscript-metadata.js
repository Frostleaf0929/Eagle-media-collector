// 校验用户脚本的元数据是否会让 Greasy Fork 拒绝导入。
//
// 为什么有这个脚本
// ---------------
// 本项目在 Greasy Fork 导入上踩过一个坑，表面报错是：
//     @description:zh-TW不能为空字符, @description:ja不能为空字符
// 但脚本里那两条 @description 明明是写着的。查 Greasy Fork 源码后确认是三处
// 代码共同作用（greasyfork-org/greasyfork）：
//
//   1. app/models/script.rb:130-143
//      「每个提供 @name 的语言都必须有同语言的 @description」，否则报空字符。
//   2. app/models/script.rb:832-833
//      `next if meta_locale == locale` —— 若某语言恰好等于脚本的「默认语言」，
//      它的描述会被刻意跳过、不单独建档。
//   3. app/models/concerns/detects_locale.rb
//      默认语言由 DetectLanguage 猜脚本**前 1000 字符**得出，猜不出才回退英文。
//
// 于是：提供了 @name:ja，而检测器把脚本判成 ja → ja 落入第 2 条的跳过分支
// → 第 1 条报「ja 没有描述」。实测脚本前 1000 字符含 65 个日文假名（来自
// @name:ja 与 @description:ja），足以构成误判。
//
// 还有一个相关限制（app/models/script.rb）：
//     MAX_LENGTHS = { name: 100, description: 500 }
// 超长会被静默截断，不报错。
//
// 这个脚本把这些检查固化下来，防止改元数据时重犯。
//
// 用法：node docs/check-userscript-metadata.js [脚本路径]
//   不给参数时检查 ../save-twitter-media-to-eagle.user.js

const fs = require("fs");
const path = require("path");

const DEFAULT = path.join(__dirname, "..", "save-twitter-media-to-eagle.user.js");
const file = process.argv[2] || DEFAULT;

// Greasy Fork 的上限（源码 app/models/script.rb 的 MAX_LENGTHS）
const LIMITS = { name: 100, description: 500 };

// 语言检测只看前多少个字符（源码 detects_locale.rb: ft[0...1000]）
const DETECT_WINDOW = 1000;

const KANA = /[\u3040-\u309f\u30a0-\u30ff]/g;

if (!fs.existsSync(file)) {
  console.error("找不到脚本：" + file);
  process.exit(2);
}

const text = fs.readFileSync(file, "utf8");
const m = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/.exec(text);
if (!m) {
  console.error("找不到 UserScript 元数据块。");
  process.exit(2);
}
const head = m[1];

// 解析成 base[key] 与 loc[key][locale]
const base = {};
const loc = {};
for (const line of head.split(/\r?\n/)) {
  const mm = /^\s*\/\/\s*@([A-Za-z-]+)(?::([A-Za-z_-]+))?\s+(.*)$/.exec(line);
  if (!mm) continue;
  const key = mm[1];
  const l = mm[2];
  const val = mm[3].trim();
  if (l) {
    loc[key] = loc[key] || {};
    (loc[key][l] = loc[key][l] || []).push(val);
  } else {
    (base[key] = base[key] || []).push(val);
  }
}

let bad = 0;
const warn = [];

console.log("脚本：" + path.relative(process.cwd(), file));
console.log("");

// —— 检查 1：必需字段 ——
console.log("=== 1. 必需字段 ===");
for (const k of ["name", "namespace", "version", "description", "author", "license", "match", "run-at"]) {
  const has = (base[k] || []).length > 0;
  if (!has) bad++;
  console.log("  " + (has ? "OK  " : "!!  ") + "@" + k);
}

// —— 检查 2：长度上限 ——
console.log("");
console.log("=== 2. 长度上限（超长会被静默截断）===");
for (const [k, limit] of Object.entries(LIMITS)) {
  const v = base[k] && base[k][0];
  if (!v) continue;
  const ok = v.length <= limit;
  if (!ok) bad++;
  console.log("  " + (ok ? "OK  " : "!!  ") + "@" + k + "  " + v.length + " / " + limit + " 字符" + (ok ? "" : "  → 会被截断"));
}
for (const [key, langs] of Object.entries(loc)) {
  for (const [l, vals] of Object.entries(langs)) {
    const limit = LIMITS[key];
    if (!limit) continue;
    const ok = vals[0].length <= limit;
    if (!ok) bad++;
    console.log("  " + (ok ? "OK  " : "!!  ") + "@" + key + ":" + l + "  " + vals[0].length + " / " + limit + " 字符" + (ok ? "" : "  → 会被截断"));
  }
}

// —— 检查 3：本地化配对 ——
console.log("");
console.log("=== 3. 本地化配对（有 @name:xx 就必须有 @description:xx）===");
const nameLangs = Object.keys(loc.name || {});
const descLangs = Object.keys(loc.description || {});
console.log("  @name 语言变体        : " + (nameLangs.join(", ") || "（无）"));
console.log("  @description 语言变体 : " + (descLangs.join(", ") || "（无）"));
for (const l of nameLangs) {
  const d = loc.description && loc.description[l];
  const ok = d && d[0] && d[0].length > 0;
  if (!ok) bad++;
  console.log("  " + (ok ? "OK  " : "!!  ") + "@description:" + l + (ok ? "  已配对" : "  缺失 → Greasy Fork 会拒绝导入"));
}
for (const l of descLangs) {
  if (!nameLangs.includes(l)) {
    bad++;
    console.log("  !! 有 @description:" + l + " 但没有 @name:" + l);
  }
}

// —— 检查 4：语言检测风险（本项目踩的那个坑）——
console.log("");
console.log("=== 4. 语言检测风险 ===");
const window = text.slice(0, DETECT_WINDOW);
const kanaInWindow = window.match(KANA) || [];
const nonBaseLangs = [...new Set([...nameLangs, ...descLangs])].filter((l) => l !== "en");

console.log("  前 " + DETECT_WINDOW + " 字符里的日文假名: " + kanaInWindow.length);

if (nonBaseLangs.length === 0) {
  console.log("  OK  只有基础语言，没有本地化变体 —— 不会触发该问题");
} else if (nonBaseLangs.length === 1) {
  console.log("  OK  只有一种本地化变体（" + nonBaseLangs[0] + "）—— 即使检测器判成它，");
  console.log("      @name 与 @description 同语言配对，校验仍能通过");
} else {
  warn.push("有 " + nonBaseLangs.length + " 种本地化变体：" + nonBaseLangs.join(", "));
  console.log("  !!  有 " + nonBaseLangs.length + " 种本地化变体（" + nonBaseLangs.join(", ") + "）");
  console.log("      检测器只会选中其中一个作为默认语言，那个语言的描述会被跳过建档；");
  console.log("      若其余语言的 @name 存在而同语言描述被跳过 → 导入被拒。");
  console.log("      建议只保留一种非基础语言。");
}

if (kanaInWindow.length > 0 && nonBaseLangs.includes("ja")) {
  console.log("  !!  前 " + DETECT_WINDOW + " 字符含假名且有 @name:ja / @description:ja ——");
  console.log("      容易被 DetectLanguage 判成 ja，正是本项目踩过的情形。");
}

// —— 检查 5：压缩/混淆（Greasy Fork 规则禁止）——
console.log("");
console.log("=== 5. 是否被压缩混淆 ===");
const body = text.slice(m.index + m[0].length);
const longest = Math.max(...body.split(/\r?\n/).map((l) => l.length));
const compressed = longest > 5000;
if (compressed) bad++;
console.log("  " + (compressed ? "!!  " : "OK  ") + "最长代码行 " + longest + " 字符" + (compressed ? "  → 疑似压缩" : ""));

// —— 结论 ——
console.log("");
if (bad === 0 && warn.length === 0) {
  console.log("结论：元数据没有问题，可以导入 Greasy Fork。");
} else if (bad === 0) {
  console.log("结论：没有硬错误，但有 " + warn.length + " 项风险提示（见上）。");
} else {
  console.log("结论：有 " + bad + " 项会让 Greasy Fork 拒绝的问题，先修再导入。");
}
process.exit(bad === 0 ? 0 : 1);
