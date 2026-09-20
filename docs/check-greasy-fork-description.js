// 核对「粘到 Greasy Fork 的描述」是否超过 500 字符上限。
//
// 为什么要这个脚本：Greasy Fork 对脚本描述有两条限制（源码 app/models/script.rb）：
//   1. MAX_LENGTHS = { name: 100, description: 500, additional_info: 50_000 }
//   2. 导入路径会开 truncate_description = true —— 超长不是报错，而是静默截断
// 本项目踩过一次：粘了 1405 字符的版本，被砍在第 500 字符。
//
// 用法：node docs/check-greasy-fork-description.js
//   （也可以传自己的文件：node docs/check-greasy-fork-description.js 某文件.md）

const fs = require("fs");
const path = require("path");

const LIMIT = 500;
const file = process.argv[2] || path.join(__dirname, "greasy-fork-description.md");

if (!fs.existsSync(file)) {
  console.error("找不到文件：" + file);
  process.exit(2);
}

const md = fs.readFileSync(file, "utf8");
const FENCE = "\u0060\u0060\u0060";

// 在「标题行」里找关键词那一节，再取该节下的第一个 ```text 块。
// 不能直接用 indexOf(关键词)：开头的对照表里也会提到「描述文本框」，
// 会把下一个 text 块（脚本名）误当成描述文案 —— 踩过一次。
function findHeading(text, keyword) {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && line.includes(keyword)) return offset;
    offset += line.length + 1;
  }
  return -1;
}

function extractBlock(text, headingKeyword) {
  const h = findHeading(text, headingKeyword);
  if (h < 0) return null;
  const s = text.indexOf(FENCE + "text", h);
  if (s < 0) return null;
  const bodyStart = text.indexOf("\n", s) + 1;
  const e = text.indexOf(FENCE, bodyStart);
  if (e < 0) return null;
  return text.slice(bodyStart, e).replace(/\n$/, "");
}

const heading = "描述文本框";
const body = extractBlock(md, heading);
if (body === null) {
  console.error("没能从 " + path.basename(file) + " 里提取到「" + heading + "」下的 text 代码块。");
  process.exit(2);
}
if (body.length < 100) {
  console.error("提取到的内容只有 " + body.length + " 字符，明显不是描述文案（可能抓错了段落）：");
  console.error("  " + body.split("\n")[0]);
  process.exit(2);
}

console.log("文件：" + path.relative(process.cwd(), file));
console.log("");
console.log("=== 描述长度 ===");
console.log("  字符数 : " + body.length);
console.log("  上限   : " + LIMIT);
console.log("  占用   : " + ((body.length / LIMIT) * 100).toFixed(1) + "%");

let bad = 0;

if (body.length > LIMIT) {
  bad++;
  console.log("");
  console.log("  !! 超限 —— Greasy Fork 会静默截断到前 " + LIMIT + " 字符");
  console.log("     截断后的结尾会是：");
  console.log("     「" + body.slice(LIMIT - 40, LIMIT) + "」");
  console.log("     后面这些内容会看不见：");
  console.log("     「" + body.slice(LIMIT, LIMIT + 60).replace(/\n/g, " ") + "…」");
} else {
  console.log("");
  console.log("  OK 在限内");
}

// 附加检查：Markdown 链接语法在纯文本字段里不会渲染
const mdLinks = body.match(/\[[^\]]+\]\([^)]+\)/g);
if (mdLinks) {
  bad++;
  console.log("");
  console.log("  !! 含 Markdown 链接语法（纯文本字段不渲染，会原样显示）：");
  mdLinks.forEach((l) => console.log("     " + l));
}

// 附加检查：表格语法同理
if (/^\s*\|.*\|\s*$/m.test(body)) {
  bad++;
  console.log("");
  console.log("  !! 含 Markdown 表格语法（纯文本字段不渲染）");
}

console.log("");
console.log(bad === 0 ? "结论：可以直接粘到 Greasy Fork。" : "结论：有 " + bad + " 项问题，改完再粘。");
process.exit(bad === 0 ? 0 : 1);
