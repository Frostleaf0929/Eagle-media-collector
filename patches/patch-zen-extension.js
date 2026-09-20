// 给 Zen(Firefox) 版 Eagle 扩展打「拖拽取原图」补丁
//
// 背景：
//   Edge 版（基于 3.1.26 / MV3）已经打好并验证通过。
//   Zen 版是 3.1.19 / MV2，文件内容与 Edge 版有差异（版本不同、变量名不同），
//   所以不能直接复制文件，必须在 Zen 版自己的文件上做等价替换。
//
// 本脚本只操作工作区里的副本，**不碰 Zen 安装目录里的原文件**。
//
// 运行：node patch-zen-extension.js
//
// 许可：MIT

const fs = require("fs");
const path = require("path");

const WS = __dirname;
// 输入：从 Zen 安装目录解出来的 Eagle for Firefox 扩展（获取方法见 README）
// 把 %APPDATA%\zen\Profiles\<配置>\extensions\{228a49ed-...}.xpi 解压到 zen-eagle-ext
const ZEN = path.join(WS, "zen-eagle-ext");
const OUT = path.join(WS, "zen-eagle-original-drag");       // 输出：打好补丁的 Firefox 版

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const report = [];
function patch(rel, pairs) {
  const p = path.join(OUT, rel);
  if (!fs.existsSync(p)) { report.push(`!! 文件不存在 ${rel}`); return; }
  let t = fs.readFileSync(p, "utf8");
  const before = t.length;
  for (const [from, to, desc] of pairs) {
    if (!t.includes(from)) { report.push(`!! 锚点未命中 ${rel} :: ${desc}`); continue; }
    const n = t.split(from).length - 1;
    t = t.split(from).join(to);
    report.push(`OK  ${rel} :: ${desc}（替换 ${n} 处）`);
  }
  fs.writeFileSync(p, t, "utf8");
  report.push(`    ${rel}: ${before} -> ${t.length} 字节`);
}

console.log("1) 复制 Zen 原版 ->", OUT);
rmrf(OUT);
copyDir(ZEN, OUT);
for (const f of ["META-INF"]) rmrf(path.join(OUT, f));

/* ============ 2) url-enlarger.js：新增 enlargeToOriginal / #rewriteSync / #overrides ============ */
console.log("2) 打补丁：url-enlarger.js");
patch("js/lib/api/url-enlarger.js", [
  [
    "async enlargeBatch(",
    "async enlargeToOriginal(r){try{if(!r||\"string\"!=typeof r)return{url:r,largeUrl:null};var e=this.#overrides.find(e=>{try{return e.test(r)}catch(e){return!1}});if(e){var t=e.build(r);return t&&t!==r?{url:r,largeUrl:t}:{url:r,largeUrl:null}}var a=this.isEnlargable(r);if(!a)return{url:r,largeUrl:null};var o=await this.#rewriteSync(a,r);return o&&o!==r?{url:r,largeUrl:o}:{url:r,largeUrl:null}}catch(e){return{url:r,largeUrl:null}}}#overrides=[{test:e=>/(^|\\.)twimg\\.com\\//.test(e)&&e.indexOf(\"name=\")!==-1,build:e=>e.replace(/name=[^&]*/,\"name=orig\")}];async#rewriteSync(e,t){try{if(\"function\"==typeof e.replace)return e.replace(t);if(\"function\"==typeof e.replaceAsync)return await e.replaceAsync(t)}catch(e){}return t}async enlargeBatch(",
    "新增 enlargeToOriginal（不依赖网络探测的确定性改写）",
  ],
]);

/* ============ 3) preference.js：新增 dragToOriginal ============ */
console.log("3) 打补丁：preference.js");
patch("js/lib/api/preference.js", [
  [
    "agreePrivacyPolicy:!1,downloadViaBrowser:!1}",
    "agreePrivacyPolicy:!1,downloadViaBrowser:!1,dragToOriginal:!1}",
    "默认值新增 dragToOriginal",
  ],
  [
    "set agreePrivacyPolicy(e){this.#userPreferences.agreePrivacyPolicy=e}",
    "set agreePrivacyPolicy(e){this.#userPreferences.agreePrivacyPolicy=e}get dragToOriginal(){return this.#userPreferences.dragToOriginal}set dragToOriginal(e){this.#userPreferences.dragToOriginal=e}",
    "新增 dragToOriginal 的 get/set",
  ],
]);

/* ============ 4) content.js：开关开启时走 enlargeToOriginal ============ */
console.log("4) 打补丁：content.js");
patch("js/content.js", [
  [
    "eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(l.src):await eagle.urlEnlarger.enlarge(l.src)",
    "eagle.preference.dragToOriginal?await eagle.urlEnlarger.enlargeToOriginal(l.src):(eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(l.src):await eagle.urlEnlarger.enlarge(l.src))",
    "拖拽路径接入开关",
  ],
  [
    "eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(a.src):await eagle.urlEnlarger.enlarge(a.src)",
    "eagle.preference.dragToOriginal?await eagle.urlEnlarger.enlargeToOriginal(a.src):(eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(a.src):await eagle.urlEnlarger.enlarge(a.src))",
    "右键路径接入开关",
  ],
]);

/* ============ 5) element-inspector.js：开关开启时不生成 base64 ============ */
// 注意：Firefox 版这里的变量名是 a.src / a.base64（Edge 版是 l.src / l.base64），
// 所以必须按 Zen 版自己的写法替换。
console.log("5) 打补丁：element-inspector.js");
patch("js/lib/api/element-inspector.js", [
  [
    '(!t||eagle.preference.downloadViaBrowser||"img"!==e.tagName.toLowerCase()||e.hasAttribute("eagle-src")||(r=await eagle.cacheHelper.toDataURL(a.src))&&(a.base64=r),a)',
    '(!t||eagle.preference.downloadViaBrowser||eagle.preference.dragToOriginal||"img"!==e.tagName.toLowerCase()||e.hasAttribute("eagle-src")||(r=await eagle.cacheHelper.toDataURL(a.src))&&(a.base64=r),a)',
    "开关开启时不再生成 base64（修「开关反了」）",
  ],
]);

/* ============ 6) popup：新增开关 ============ */
console.log("6) 打补丁：popup.html + 控制器");
patch("popup/js/controllers/preference.js", [
  [
    "a.toggleDownloadViaBrowser=()=>{r.preference.downloadViaBrowser=!r.preference.downloadViaBrowser,r.preference.save()},",
    "a.toggleDownloadViaBrowser=()=>{r.preference.downloadViaBrowser=!r.preference.downloadViaBrowser,r.preference.save()},a.toggleDragToOriginal=()=>{r.preference.dragToOriginal=!r.preference.dragToOriginal,r.preference.save()},",
    "新增 toggleDragToOriginal",
  ],
]);

// popup.html：在 download-via-browser 整个区块之后插入新开关行
{
  const p = path.join(OUT, "popup/popup.html");
  let t = fs.readFileSync(p, "utf8");
  const anchor = 'ng-bind-html="\'settings.eagle-version-not-support-download-via-browser\' | i18n"';
  const idx = t.indexOf(anchor);
  if (idx < 0) {
    report.push("!! popup.html 未找到插入锚点");
  } else {
    // 找到该 alert 区块的结束 </div></div>
    const close = t.indexOf("</div>\n\t\t\t\t\t\t\t\t</div>", idx);
    const cut = close >= 0 ? close + "</div>\n\t\t\t\t\t\t\t\t</div>".length : -1;
    if (cut < 0) {
      report.push("!! popup.html 找不到 alert 区块结尾，改用简单插入");
      const ins = t.indexOf("</div>", t.indexOf("</div>", idx) + 6);
      const row = `
							<div class="panel-row with-description">
								<div class="panel">
									<label for="drag-to-original">{{ 'settings.drag-to-original' | i18n }}</label>
									<label class="switch">
										<input type="checkbox" ng-checked="preference.dragToOriginal" ng-click="toggleDragToOriginal()" />
										<span class="slider"></span>
									</label>
								</div>
								<div class="description" ng-bind-html="'settings.drag-to-original-description' | i18n"></div>
							</div>`;
      t = t.slice(0, ins + 6) + row + t.slice(ins + 6);
      report.push("OK  popup.html :: 已插入开关行（简单方式）");
    } else {
      const row = `
							<div class="panel-row with-description">
								<div class="panel">
									<label for="drag-to-original">{{ 'settings.drag-to-original' | i18n }}</label>
									<label class="switch">
										<input type="checkbox" ng-checked="preference.dragToOriginal" ng-click="toggleDragToOriginal()" />
										<span class="slider"></span>
									</label>
								</div>
								<div class="description" ng-bind-html="'settings.drag-to-original-description' | i18n"></div>
							</div>`;
      t = t.slice(0, cut) + row + t.slice(cut);
      report.push("OK  popup.html :: 已插入开关行");
    }
    fs.writeFileSync(p, t, "utf8");
    report.push(`    popup.html: ${t.length} 字节`);
  }
}

/* ============ 7) locales：新增文案 ============ */
console.log("7) 打补丁：locales 文案");
const TEXT = {
  "en.json": {
    l: "Drag to get the original image",
    d: "When enabled, dragging an image saves the original file instead of the thumbnail. Uses Eagle's built-in site rules to rewrite thumbnail URLs into original-image URLs.",
  },
  "ja.json": {
    l: "ドラッグで原図を取得",
    d: "有効にすると、画像をドラッグした際にサムネイルではなく原図を保存します。Eagle 内蔵のサイト別ルールでサムネイル URL を原図 URL に書き換えます。",
  },
  "zh-TW.json": {
    l: "拖曳時取得原圖",
    d: "啟用後，拖曳圖片會直接收藏原圖而非縮圖。會使用 Eagle 內建的網站規則，把縮圖網址改寫為原圖網址。",
  },
  "zh-CN.json": {
    l: "拖拽时获取原图",
    d: "启用后，拖拽图片会直接收藏原图而非缩略图。会使用 Eagle 内置的网站规则，把缩略图网址改写为原图网址。",
  },
};
for (const f of Object.keys(TEXT)) {
  const p = path.join(OUT, "locales", f);
  if (!fs.existsSync(p)) { report.push(`-- locales/${f} 不存在，跳过`); continue; }
  let t = fs.readFileSync(p, "utf8");
  if (t.includes("settings.drag-to-original")) { report.push(`-- locales/${f} 已有文案，跳过`); continue; }
  const anchorKey = '"settings.download-via-browser-description":';
  const i = t.indexOf(anchorKey);
  if (i < 0) { report.push(`!! locales/${f} 未找到锚点`); continue; }
  const nl = t.includes("\r\n") ? "\r\n" : "\n";
  const eol = t.indexOf(nl, i);
  const ins =
    nl + "\t" + '"settings.drag-to-original": "' + TEXT[f].l + '",' +
    nl + "\t" + '"settings.drag-to-original-description": "' + TEXT[f].d + '",';
  t = t.slice(0, eol) + ins + t.slice(eol);
  fs.writeFileSync(p, t, "utf8");
  report.push(`OK  locales/${f} :: 新增 2 条文案`);
}

/* ============ 8) manifest：改名字，便于和原版区分 ============ */
console.log("8) manifest 调整");
{
  const p = path.join(OUT, "manifest.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  report.push(`    manifest: name=${m.name} version=${m.version} mv=${m.manifest_version}`);
  report.push(`    含 key: ${"key" in m}  含 update_url: ${"update_url" in m}`);
}

// _locales 里的显示名（如果存在）
for (const loc of ["en", "ja", "zh_CN", "zh_TW"]) {
  const p = path.join(OUT, "_locales", loc, "messages.json");
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, "utf8");
  t = t.replace(/"Eagle for Firefox"/g, '"Eagle Original Drag (Firefox)"');
  t = t.replace(/"Eagle"/g, '"Eagle Original Drag (Firefox)"');
  fs.writeFileSync(p, t, "utf8");
}

console.log("\n================ 补丁报告 ================");
report.forEach((r) => console.log("  " + r));
const bad = report.filter((r) => r.startsWith("!!")).length;
console.log(bad === 0 ? "\n全部成功" : `\n有 ${bad} 处失败`);
process.exit(bad === 0 ? 0 : 1);
