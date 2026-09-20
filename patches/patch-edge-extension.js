// 给 Eagle 浏览器扩展打「拖拽取原图」补丁（Edge / Chromium 版）
//
// 这个脚本做三件事：
//   1. 从你本机已安装的 Eagle for Edge 扩展复制一份到工作目录
//   2. 对它打补丁：新增「拖拽时获取原图」开关
//   3. 校验补丁是否完整
//
// 为什么是"补丁脚本"而不是"改好的扩展"：
//   补丁版里 97.7% 的文件是 Eagle 的原始代码。直接再分发整包会涉及 Eagle 的授权问题，
//   所以这个仓库只提供补丁逻辑 —— 拿你自己机器上那份扩展来打补丁。
//
// 依赖：本机已安装 Eagle for Edge 扩展（Chrome/Edge 商店版）
// 运行：node patch-edge-extension.js
//
// 许可：MIT

const fs = require("fs");
const path = require("path");

const WS = __dirname;
const OUT = path.join(WS, "eagle-original-drag-clean");

// Eagle for Edge 扩展的 ID（商店版）
const EXT_ID = "cfgchmkedjfehclfhhmgedljhcibojcm";

// 可能的安装位置（本机 Edge / Chrome / Brave）
const EDGE_ROOTS = [
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data"),
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data"),
  path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "User Data"),
];

function findInstalledExtension() {
  for (const root of EDGE_ROOTS) {
    if (!root || !fs.existsSync(root)) continue;
    for (const profile of fs.readdirSync(root)) {
      const extDir = path.join(root, profile, "Extensions", EXT_ID);
      if (!fs.existsSync(extDir)) continue;
      // 取版本号最大的那个目录
      const versions = fs
        .readdirSync(extDir)
        .filter((v) => fs.statSync(path.join(extDir, v)).isDirectory())
        .sort()
        .reverse();
      if (versions.length) return path.join(extDir, versions[0]);
    }
  }
  return null;
}

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

function main() {
  const src = findInstalledExtension();
  if (!src) {
    console.error("找不到已安装的 Eagle for Edge 扩展。");
    console.error("请确认已从商店安装 Eagle for Edge，然后重新运行。");
    console.error("查找过的位置：");
    EDGE_ROOTS.forEach((r) => console.error("  " + r));
    process.exit(1);
  }
  console.log("找到已安装扩展：", src);

  console.log("1) 复制到", OUT);
  rmrf(OUT);
  copyDir(src, OUT);
  rmrf(path.join(OUT, "_metadata"));      // 商店签名残留，加载解压缩扩展时要去掉
  // 清掉 macOS 垃圾文件
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === ".DS_Store") fs.rmSync(p, { force: true });
    }
  })(OUT);

  console.log("2) 打补丁");

  // —— url-enlarger.js：新增确定性改写（不依赖网络探测，这正是原版会超时的地方）——
  patch("js/lib/api/url-enlarger.js", [
    [
      "async enlargeBatch(",
      'async enlargeToOriginal(r){try{if(!r||"string"!=typeof r)return{url:r,largeUrl:null};var e=this.#overrides.find(e=>{try{return e.test(r)}catch(e){return!1}});if(e){var t=e.build(r);return t&&t!==r?{url:r,largeUrl:t}:{url:r,largeUrl:null}}var a=this.isEnlargable(r);if(!a)return{url:r,largeUrl:null};var o=await this.#rewriteSync(a,r);return o&&o!==r?{url:r,largeUrl:o}:{url:r,largeUrl:null}}catch(e){return{url:r,largeUrl:null}}}#overrides=[{test:e=>/(^|\\.)twimg\\.com\\//.test(e)&&e.indexOf("name=")!==-1,build:e=>e.replace(/name=[^&]*/,"name=orig")}];async#rewriteSync(e,t){try{if("function"==typeof e.replace)return e.replace(t);if("function"==typeof e.replaceAsync)return await e.replaceAsync(t)}catch(e){}return t}async enlargeBatch(',
      "新增 enlargeToOriginal（确定性改写，不发网络请求）",
    ],
  ]);

  // —— preference.js：新增开关 ——
  patch("js/lib/api/preference.js", [
    ["agreePrivacyPolicy:!1,downloadViaBrowser:!1}", "agreePrivacyPolicy:!1,downloadViaBrowser:!1,dragToOriginal:!1}", "默认值"],
    [
      "get downloadViaBrowser(){return this.#userPreferences.downloadViaBrowser&&eagle.env.isAppSupportDownloadViaBrowser}set downloadViaBrowser(e){this.#userPreferences.downloadViaBrowser=e}",
      "get downloadViaBrowser(){return this.#userPreferences.downloadViaBrowser&&eagle.env.isAppSupportDownloadViaBrowser}set downloadViaBrowser(e){this.#userPreferences.downloadViaBrowser=e}get dragToOriginal(){return this.#userPreferences.dragToOriginal}set dragToOriginal(e){this.#userPreferences.dragToOriginal=e}",
      "get/set 访问器",
    ],
  ]);

  // —— content.js：两条路径接入开关 ——
  patch("js/content.js", [
    [
      "eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(l.src):await eagle.urlEnlarger.enlarge(l.src)",
      "eagle.preference.dragToOriginal?await eagle.urlEnlarger.enlargeToOriginal(l.src):(eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(l.src):await eagle.urlEnlarger.enlarge(l.src))",
      "拖拽路径",
    ],
    [
      "eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(a.src):await eagle.urlEnlarger.enlarge(a.src)",
      "eagle.preference.dragToOriginal?await eagle.urlEnlarger.enlargeToOriginal(a.src):(eagle.preference.downloadViaBrowser?await eagle.urlEnlarger.enlargeWithoutCheckEagleHasAbility(a.src):await eagle.urlEnlarger.enlarge(a.src))",
      "右键路径",
    ],
  ]);

  // —— element-inspector.js：开关开启时不要生成 base64（否则会用缩略图覆盖原图 URL）——
  patch("js/lib/api/element-inspector.js", [
    [
      '(!t||eagle.preference.downloadViaBrowser||"img"!==e.tagName.toLowerCase()||e.hasAttribute("eagle-src")||(r=await eagle.cacheHelper.toDataURL(l.src))&&(l.base64=r),l)',
      '(!t||eagle.preference.downloadViaBrowser||eagle.preference.dragToOriginal||"img"!==e.tagName.toLowerCase()||e.hasAttribute("eagle-src")||(r=await eagle.cacheHelper.toDataURL(l.src))&&(l.base64=r),l)',
      "base64 跳过条件",
    ],
  ]);

  // —— popup 控制器 ——
  patch("popup/js/controllers/preference.js", [
    [
      "a.toggleDownloadViaBrowser=()=>{r.preference.downloadViaBrowser=!r.preference.downloadViaBrowser,r.preference.save()},",
      "a.toggleDownloadViaBrowser=()=>{r.preference.downloadViaBrowser=!r.preference.downloadViaBrowser,r.preference.save()},a.toggleDragToOriginal=()=>{r.preference.dragToOriginal=!r.preference.dragToOriginal,r.preference.save()},",
      "新增 toggleDragToOriginal",
    ],
  ]);

  // —— popup.html：插入开关行 ——
  {
    const p = path.join(OUT, "popup/popup.html");
    let t = fs.readFileSync(p, "utf8");
    if (t.includes("toggleDragToOriginal()")) {
      report.push("-- popup.html 已含开关，跳过");
    } else {
      const anchor = "ng-bind-html=\"'settings.eagle-version-not-support-download-via-browser' | i18n\"";
      const idx = t.indexOf(anchor);
      if (idx < 0) {
        report.push("!! popup.html 未找到锚点");
      } else {
        const closeTag = "</div>\n\t\t\t\t\t\t\t\t</div>";
        const close = t.indexOf(closeTag, idx);
        const cut = close >= 0 ? close + closeTag.length : -1;
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
        if (cut > 0) {
          t = t.slice(0, cut) + row + t.slice(cut);
          report.push("OK  popup.html :: 已插入开关行");
        } else {
          report.push("!! popup.html 找不到插入点结尾");
        }
        fs.writeFileSync(p, t, "utf8");
      }
    }
  }

  // —— locales 文案 ——
  const TEXT = {
    "en.json": { l: "Drag to get the original image", d: "When enabled, dragging an image saves the original file instead of the thumbnail. Uses Eagle's built-in site rules to rewrite thumbnail URLs into original-image URLs." },
    "ja.json": { l: "ドラッグで原図を取得", d: "有効にすると、画像をドラッグした際にサムネイルではなく原図を保存します。Eagle 内蔵のサイト別ルールでサムネイル URL を原図 URL に書き換えます。" },
    "zh-TW.json": { l: "拖曳時取得原圖", d: "啟用後，拖曳圖片會直接收藏原圖而非縮圖。會使用 Eagle 內建的網站規則，把縮圖網址改寫為原圖網址。" },
    "zh-CN.json": { l: "拖拽时获取原图", d: "启用后，拖拽图片会直接收藏原图而非缩略图。会使用 Eagle 内置的网站规则，把缩略图网址改写为原图网址。" },
  };
  for (const f of Object.keys(TEXT)) {
    const p = path.join(OUT, "locales", f);
    if (!fs.existsSync(p)) { report.push(`-- locales/${f} 不存在`); continue; }
    let t = fs.readFileSync(p, "utf8");
    if (t.includes("settings.drag-to-original")) { report.push(`-- locales/${f} 已有文案`); continue; }
    const anchorKey = '"settings.download-via-browser-description":';
    const i = t.indexOf(anchorKey);
    if (i < 0) { report.push(`!! locales/${f} 未找到锚点`); continue; }
    const nl = t.includes("\r\n") ? "\r\n" : "\n";
    const eol = t.indexOf(nl, i);
    const ins = nl + "\t" + '"settings.drag-to-original": "' + TEXT[f].l + '",' + nl + "\t" + '"settings.drag-to-original-description": "' + TEXT[f].d + '",';
    t = t.slice(0, eol) + ins + t.slice(eol);
    fs.writeFileSync(p, t, "utf8");
    report.push(`OK  locales/${f} :: 新增文案`);
  }

  // —— _locales 显示名（便于和商店版区分）——
  for (const loc of ["en", "ja", "zh_CN", "zh_TW"]) {
    const p = path.join(OUT, "_locales", loc, "messages.json");
    if (!fs.existsSync(p)) continue;
    let t = fs.readFileSync(p, "utf8");
    t = t.replace(/"Eagle for Edge"/g, '"Eagle Original Drag"');
    fs.writeFileSync(p, t, "utf8");
  }

  // —— manifest：去掉商店的 key 与 update_url（否则加载解压缩扩展会报错 / ID 冲突）——
  {
    const p = path.join(OUT, "manifest.json");
    const raw = fs.readFileSync(p, "utf8");
    const kept = raw.split(/\r?\n/).filter((ln) => {
      const s = ln.trim();
      return !s.startsWith('"key"') && !s.startsWith('"update_url"');
    });
    fs.writeFileSync(p, kept.join("\n"), "utf8");
    report.push("OK  manifest.json :: 已移除 key 与 update_url");
  }

  // —— 校验 ——
  console.log("3) 校验");
  const m = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  report.push(`    manifest: name=${m.name} version=${m.version} mv=${m.manifest_version}`);
  const must = [
    ["js/lib/api/preference.js", "dragToOriginal:!1"],
    ["js/lib/api/url-enlarger.js", "async enlargeToOriginal("],
    ["js/content.js", "eagle.preference.dragToOriginal?await eagle.urlEnlarger.enlargeToOriginal(l.src)"],
    ["js/lib/api/element-inspector.js", "eagle.preference.dragToOriginal"],
    ["popup/popup.html", "toggleDragToOriginal()"],
  ];
  for (const [rel, token] of must) {
    const t = fs.readFileSync(path.join(OUT, rel), "utf8");
    report.push(`${t.includes(token) ? "OK " : "!! "} 补丁点 ${rel}`);
  }

  console.log("\n================ 报告 ================");
  report.forEach((r) => console.log("  " + r));
  const bad = report.filter((r) => r.startsWith("!!")).length;
  console.log(bad === 0 ? "\n成功。下一步：Edge → edge://extensions → 开发人员模式 → 加载解压缩的扩展 → 选择：" + OUT
                        : `\n有 ${bad} 处失败`);
  process.exit(bad === 0 ? 0 : 1);
}

main();
