// ==UserScript==
// @name         Save Twitter/X Media to Eagle
// @name:zh-CN   Twitter/X 媒体收藏到 Eagle
// @name:zh-TW   Twitter/X 媒體收藏到 Eagle
// @name:ja      Twitter/X のメディアを Eagle に保存
// @namespace    https://github.com/Frostleaf0929/Eagle-media-collector
// @version      3.2.0
// @description  Add an Eagle button to the tweet action bar: one click saves the original video/images into Eagle. Visual settings panel, custom filename template with sequence numbers, optional categorize dialog, jump-to-Eagle links.
// @description:zh-CN  在推文操作栏加 Eagle 按钮，一键把原视频/原图存进 Eagle；可视化设置面板、自定义文件名与序号、可选分类面板、可跳转 Eagle
// @author       Frostleaf0929
// @license      MIT
// @homepageURL  https://github.com/Frostleaf0929/Eagle-media-collector
// @supportURL   https://github.com/Frostleaf0929/Eagle-media-collector/issues
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://fixupx.com/*
// @match        https://fxtwitter.com/*
// @match        https://vxtwitter.com/*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%233B9BFF'/%3E%3Cpath d='M9 19h14l-2.5 3.2H11.5z' fill='%23fff'/%3E%3Cpath d='M12 12.5l4-4 4 4-2.2 1.6h-3.6z' fill='%23fff'/%3E%3C/svg%3E
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

/* eslint-disable no-console */
(function () {
  "use strict";

  /* =========================== 常量与配置 =========================== */
  const EAGLE_API = "http://localhost:41595";
  const TAG = "[Eagle媒体]";
  const DEBUG = true;
  const VIDEO_EXTS = ["mp4", "webm", "mov", "mkv", "m4v"];
  const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];
  const MAX_NAME_LEN = 126;

  const log = (...a) => { if (DEBUG) console.log(TAG, ...a); };

  // 默认模板：不再带末尾那串长推文ID（用户反馈太丑）。
  // 同时下载多个文件时，会自动在末尾加 -01 / -02 序号（见 applySeq）。
  const DEFAULT_TEMPLATE = "{user-id} {full-text}";

  // 提交给 Eagle 后，等它后台下载完成并出现在库里的最长时间。
  // 可以覆盖（测试里会调小，避免等 45 秒）。
  let CONFIRM_TIMEOUT_MS = 45000;
  let CONFIRM_INTERVAL_MS = 1500;
  // 每个媒体提交 Eagle 之间的间隔，避免短时间内连打把 Eagle 的下载队列挤垮
  const SUBMIT_GAP_MS = 400;

  const DEFAULTS = {
    catchVideo: true,
    catchImage: true,
    catchQuoteImage: false, // 引用推文（转推卡片）里的图片，默认不抓
    askCategory: false,
    rememberFolder: true,
    autoOpen: true,
    nameTemplate: DEFAULT_TEMPLATE,
    lastFolderId: "",
    lastTags: "",
  };

  function getCfg(k) {
    try {
      if (typeof GM_getValue === "function") {
        const v = GM_getValue(k, undefined);
        if (v !== undefined) return v;
      } else {
        const v = localStorage.getItem("eagle_save_" + k);
        if (v !== null) return JSON.parse(v);
      }
    } catch (e) {}
    return DEFAULTS[k];
  }
  function setCfg(k, v) {
    try {
      if (typeof GM_setValue === "function") GM_setValue(k, v);
      else localStorage.setItem("eagle_save_" + k, JSON.stringify(v));
    } catch (e) {}
  }

  // 一次性迁移：v3.0 的默认模板末尾带 [{status-id}]（用户嫌那串长数字丑）。
  // 如果用户没有改过模板，就升级成新默认值；自定义过的（比如带 Slyvia 前缀）不动。
  (function migrateTemplate() {
    try {
      const LEGACY_DEFAULT = "{user-id} {full-text} [{status-id}]";
      if (getCfg("nameTemplate") === LEGACY_DEFAULT) setCfg("nameTemplate", DEFAULT_TEMPLATE);
    } catch (e) {}
  })();

  /* =========================== 一、媒体地址收集 =========================== */

  const mediaIdToUrl = new Map();
  const imageUrlSet = new Set();

  function mediaIdOf(u) {
    if (!u) return null;
    let m = String(u).match(/amplify_video(?:_thumb)?\/(\d+)/);
    if (m) return m[1];
    m = String(u).match(/ext_tw_video(?:_thumb)?\/(\d+)/);
    if (m) return m[1];
    m = String(u).match(/tweet_video(?:_thumb)?\/([0-9a-f]+)/i);
    if (m) return m[1];
    return null;
  }

  function imgKeyOf(u) {
    if (!u) return null;
    const m = String(u).match(/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function qualityOf(u) {
    const s = String(u);
    const m = s.match(/\/vid\/(\d+)x(\d+)\//);
    if (m) return parseInt(m[1], 10) * parseInt(m[2], 10);
    const m2 = s.match(/(\d+)x(\d+)\/[\w.-]+\.mp4/);
    if (m2) return parseInt(m2[1], 10) * parseInt(m2[2], 10);
    if (/[?&]name=orig/.test(s)) return 1e9;
    if (/[?&]name=large/.test(s)) return 1e8;
    return 0;
  }

  function isPlainMp4(u) {
    const s = String(u);
    if (!/^https?:\/\//.test(s)) return false;
    if (s.includes(".m3u8")) return false;
    if (/\/(pl|playlist)\//i.test(s)) return false;
    return /\.mp4(\?|$)/i.test(s);
  }

  function offerVideo(mediaId, url) {
    if (!mediaId || !isPlainMp4(url)) return;
    const clean = String(url).replace(/\\\//g, "/");
    const prev = mediaIdToUrl.get(mediaId);
    if (!prev || qualityOf(clean) > qualityOf(prev)) {
      mediaIdToUrl.set(mediaId, clean);
      log("收录视频", mediaId, clean);
      scheduleSync();
    }
  }

  // X 图片地址形如 pbs.twimg.com/media/XXX?format=jpg&name=small
  // 把 name 换成 orig 就是原图（同 Eagle 扩展内置的 Twitter 规则）
  function toOriginalImage(u) {
    if (!u) return null;
    const s = String(u).replace(/\\\//g, "/");
    if (!/^https?:\/\/pbs\.twimg\.com\/media\//.test(s)) return null;
    if (/[?&]name=orig/.test(s)) return s;
    if (/[?&]name=/.test(s)) return s.replace(/([?&]name=)[^&]*/, "$1orig");
    return s + (s.includes("?") ? "&" : "?") + "name=orig";
  }

  function offerImage(url) {
    const orig = toOriginalImage(url);
    if (!orig) return;
    if (!imgKeyOf(orig)) return;
    if (imageUrlSet.has(orig)) return;
    imageUrlSet.add(orig);
    log("收录图片", orig);
    scheduleSync();
  }

  const VIDEO_URL_RE = /https?:\/\/video\.twimg\.com\/[^"'\s\\<>]+?\.mp4[^"'\s\\<>]*/g;
  const IMG_URL_RE = /https?:\/\/pbs\.twimg\.com\/media\/[^"'\s\\<>]+/g;

  function harvest(text) {
    if (!text || typeof text !== "string") return;
    if (text.includes("video.twimg.com")) {
      try {
        let m;
        VIDEO_URL_RE.lastIndex = 0;
        while ((m = VIDEO_URL_RE.exec(text))) {
          const u = m[0].replace(/\\\//g, "/");
          const id = mediaIdOf(u);
          if (id) offerVideo(id, u);
        }
      } catch (e) {}
    }
    if (text.includes("pbs.twimg.com/media/")) {
      try {
        let m;
        IMG_URL_RE.lastIndex = 0;
        while ((m = IMG_URL_RE.exec(text))) offerImage(m[0]);
      } catch (e) {}
    }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        p.then((res) => {
          try {
            const u = (res && res.url) || (args[0] && args[0].url) || String(args[0] || "");
            const ct = res && res.headers && res.headers.get && res.headers.get("content-type");
            const looksJson = (ct && /json/i.test(ct)) || /graphql|Tweet|Timeline|Search/i.test(u);
            if (looksJson && res.clone) res.clone().text().then(harvest).catch(() => {});
          } catch (e) {}
        }).catch(() => {});
      } catch (e) {}
      return p;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR && OrigXHR.prototype) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (method, url, ...rest) {
      this.__eagleUrl = url;
      return origOpen.call(this, method, url, ...rest);
    };
    OrigXHR.prototype.send = function (...args) {
      try {
        this.addEventListener("load", () => {
          try {
            const u = this.__eagleUrl || "";
            if (/graphql|Tweet|Timeline|Search/i.test(u)) harvest(this.responseText);
          } catch (e) {}
        });
      } catch (e) {}
      return origSend.apply(this, args);
    };
  }

  const seenPerf = new Set();
  function scanPerformance() {
    try {
      for (const e of performance.getEntriesByType("resource") || []) {
        const n = e && e.name;
        if (!n || seenPerf.has(n)) continue;
        if (/\.mp4(\?|$)/i.test(n)) {
          seenPerf.add(n);
          const id = mediaIdOf(n);
          if (id) offerVideo(id, n);
        } else if (/pbs\.twimg\.com\/media\//.test(n)) {
          seenPerf.add(n);
          offerImage(n);
        }
      }
    } catch (e) {}
  }

  function scanScripts() {
    try {
      for (const e of document.querySelectorAll('script[type="application/json"], script:not([src])')) {
        const t = e.textContent;
        if (t && t.length > 40 && (t.includes("video.twimg.com") || t.includes("pbs.twimg.com/media/"))) harvest(t);
      }
    } catch (e) {}
  }

  function scanDomImages() {
    try {
      for (const img of document.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
        const src = img.getAttribute("src") || img.currentSrc;
        if (src) offerImage(src);
      }
    } catch (e) {}
  }

  /* =========================== 二、媒体 → 具体推文 =========================== */

  function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))); }

  /* 判断一个媒体元素是不是属于【引用推文】（转推卡片 / 嵌套的一条推文）。
     X 的 DOM 里，引用推文本身也是 <article>，嵌套在外层 article 内部。
     所以：往上找最近的 <article>，如果不是外层那一条，就说明在引用推文里。 */
  function isInQuotedTweet(el, article) {
    try {
      let n = el.parentElement;
      while (n && n !== article) {
        if (n.tagName === "ARTICLE") return true;
        n = n.parentElement;
      }
    } catch (e) {}
    return false;
  }

  // 是否要处理引用推文里的媒体（视频和图片都遵守这个开关）
  function quoteAllowed() {
    return !!getCfg("catchQuoteImage");
  }

  function videosIn(article) {
    const out = [];
    const allowQuote = quoteAllowed();
    try {
      for (const v of article.querySelectorAll("video")) {
        if (!allowQuote && isInQuotedTweet(v, article)) continue;
        const pid = mediaIdOf(v.getAttribute("poster") || "");
        let url = null;
        if (pid && mediaIdToUrl.has(pid)) url = mediaIdToUrl.get(pid);
        else {
          const sid = mediaIdOf(v.currentSrc || v.getAttribute("src") || "");
          if (sid && mediaIdToUrl.has(sid)) url = mediaIdToUrl.get(sid);
        }
        if (url) out.push(url);
      }
    } catch (e) {}
    if (!out.length) {
      try {
        const vids = article.querySelectorAll("video");
        if (vids.length === 1 && !vids[0].parentElement) { /* 不会发生，占位 */ }
      } catch (e) {}
    }
    return uniq(out);
  }

  function imagesIn(article) {
    const out = [];
    const allowQuote = quoteAllowed();
    try {
      for (const img of article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
        if (!allowQuote && isInQuotedTweet(img, article)) continue;
        const orig = toOriginalImage(img.getAttribute("src") || img.currentSrc || "");
        if (orig) out.push(orig);
      }
    } catch (e) {}
    return uniq(out);
  }

  /* =========================== 三、Eagle 接口 =========================== */

  function gm(method, url, opts) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") return reject(new Error("no GM_xmlhttpRequest"));
      GM_xmlhttpRequest({
        method, url,
        headers: (opts && opts.headers) || {},
        data: opts && opts.data,
        timeout: 60000,
        onload: (r) => resolve(r),
        onerror: () => reject(new Error("网络错误")),
        ontimeout: () => reject(new Error("超时")),
      });
    });
  }

  async function apiGet(path) {
    const url = EAGLE_API + path;
    if (typeof GM_xmlhttpRequest === "function") {
      const r = await gm("GET", url, { headers: { Accept: "application/json" } });
      if (r.status >= 200 && r.status < 300) {
        try { return JSON.parse(r.responseText); } catch (e) { return null; }
      }
      throw new Error("HTTP " + r.status);
    }
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    return res.json();
  }

  async function apiPost(path, obj) {
    const url = EAGLE_API + path;
    const body = JSON.stringify(obj);
    if (typeof GM_xmlhttpRequest === "function") {
      const r = await gm("POST", url, { headers: { "Content-Type": "application/json" }, data: body });
      if (r.status >= 200 && r.status < 300) {
        try { return JSON.parse(r.responseText); } catch (e) { return { status: "success" }; }
      }
      throw new Error("Eagle 返回 HTTP " + r.status + " " + String(r.responseText || "").slice(0, 160));
    }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    return res.json();
  }

  function saveToEagle(url, name, extra) {
    const payload = { url, name, website: location.href };
    if (extra && extra.folderId) payload.folderId = extra.folderId;
    if (extra && extra.tags && extra.tags.length) payload.tags = extra.tags;
    if (extra && extra.annotation) payload.annotation = extra.annotation;
    return apiPost("/api/item/addFromURL", payload);
  }

  /* =========================== 四、命名模板 =========================== */

  function sanitizeNamePart(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "_").trim();
  }
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  function fmtDateTime(d) {
    if (!d || isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes());
  }

  function metaForArticle(article, mediaUrl) {
    const meta = {
      "user-name": "", "user-id": "", "status-id": "", "date-time": "",
      "full-text": "", "file-name": "", "file-type": "",
    };
    try {
      if (article) {
        for (const a of article.querySelectorAll('a[href^="/"]')) {
          const h = a.getAttribute("href") || "";
          const m = h.match(/^\/([A-Za-z0-9_]+)$/);
          if (m) { meta["user-id"] = m[1]; break; }
        }
        const timeEl = article.querySelector("time[datetime]");
        if (timeEl) meta["date-time"] = fmtDateTime(new Date(timeEl.getAttribute("datetime")));
        const txt = article.querySelector('[data-testid="tweetText"]');
        if (txt && txt.textContent) meta["full-text"] = txt.textContent;
        const nameEl = article.querySelector('[data-testid="User-Name"]');
        if (nameEl && nameEl.textContent) {
          let s = nameEl.textContent.trim();
          s = s.replace(new RegExp("\\s*@" + meta["user-id"] + "[\\s\\S]*$"), "").trim();
          s = s.replace(/^[·\s]+/, "");
          meta["user-name"] = s;
        }
      }
    } catch (e) {}

    try {
      const m = location.pathname.match(/\/status\/(\d+)/);
      if (m) meta["status-id"] = m[1];
    } catch (e) {}
    if (!meta["status-id"]) {
      const mid = (function () {
        try {
          for (const v of article ? article.querySelectorAll("video") : []) {
            const id = mediaIdOf(v.getAttribute("poster") || "");
            if (id) return id;
          }
        } catch (e) {}
        const vals = Array.from(mediaIdToUrl.keys()).filter(Boolean);
        return vals.length ? vals[vals.length - 1] : "";
      })();
      meta["status-id"] = mid || "";
    }

    if (mediaUrl) {
      try {
        const p = String(mediaUrl).split("?")[0];
        const base = p.split("/").pop() || "";
        const m = base.match(/^(.*)\.([A-Za-z0-9]+)$/);
        meta["file-name"] = m ? m[1] : base;
        meta["file-type"] = m ? m[2].toLowerCase() : (/pbs\.twimg\.com/.test(mediaUrl) ? "jpg" : "");
      } catch (e) {}
    }

    if (!meta["full-text"]) {
      let s = (document.title || "").replace(/\s*[/|]\s*X\s*$/, "").replace(/^\(\d+\)\s*/, "");
      if (meta["user-id"]) s = s.replace(new RegExp("^@?" + meta["user-id"] + "\\s*"), "");
      meta["full-text"] = s.replace(/^\([^)]*\)\s*/, "").trim();
    }
    return meta;
  }

  function renderTemplate(tpl, meta) {
    let out = String(tpl || DEFAULT_TEMPLATE);
    out = out.replace(/\{([\w-]+)\}/g, (w, key) => {
      const v = meta[key];
      return v === undefined || v === null ? "" : String(v);
    });
    out = sanitizeNamePart(out)
      .replace(/\s*\[\s*\]/g, "")
      .replace(/\s*\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-_·]+|[\s\-_·]+$/g, "")
      .trim();
    if (out.length > MAX_NAME_LEN) out = out.slice(0, MAX_NAME_LEN).trim();
    return out || "twitter media";
  }

  function buildName(article, mediaUrl) {
    return renderTemplate(getCfg("nameTemplate") || DEFAULT_TEMPLATE, metaForArticle(article, mediaUrl));
  }

  // 多条媒体时加序号：name-01、name-02 …
  // 单条时不加序号，保持名字干净。
  function applySeq(name, index, total, digits) {
    if (!total || total <= 1) return name;
    const width = digits || String(total).length;
    const n = String(index + 1).padStart(Math.max(2, width), "0");
    return name + "-" + n;
  }

  /* =========================== 五、判重与保存 =========================== */

  const savedIds = new Set();
  const libraryIndex = new Set();
  const pendingUrls = new Set();
  let libraryLoaded = false;
  let libraryLoading = null;

  function mediaKey(u) {
    const v = mediaIdOf(u);
    if (v) return "v:" + v;
    const i = imgKeyOf(u);
    if (i) return "i:" + i;
    return null;
  }

  async function loadLibraryIndex() {
    if (libraryLoaded) return;
    if (libraryLoading) return libraryLoading;
    libraryLoading = (async () => {
      try {
        const limit = 1000;
        for (let offset = 0, guard = 0; guard < 30; guard++, offset += limit) {
          const res = await apiGet("/api/item/list?limit=" + limit + "&offset=" + offset + "&orderBy=CREATEDATE");
          const arr = (res && res.data) || [];
          for (const it of arr) {
            if (!it) continue;
            const ext = String(it.ext || "").toLowerCase();
            if (!VIDEO_EXTS.includes(ext) && !IMAGE_EXTS.includes(ext)) continue;
            if (it.url) {
              const k = mediaKey(it.url);
              if (k) libraryIndex.add(k);
            }
          }
          if (arr.length < limit) break;
        }
        libraryLoaded = true;
        log("库索引完成，key", libraryIndex.size);
      } catch (e) {
        log("库索引失败（判重降级）", e.message);
      } finally {
        libraryLoading = null;
        syncAllButtons();
      }
    })();
    return libraryLoading;
  }

  function isSaved(url) {
    const k = mediaKey(url);
    if (!k) return false;
    return savedIds.has(k) || libraryIndex.has(k);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function findByKey(key) {
    if (!key) return null;
    try {
      const res = await apiGet("/api/item/list?limit=80&orderBy=CREATEDATE");
      for (const it of (res && res.data) || []) {
        if (!it || !it.url) continue;
        if (mediaKey(it.url) === key) return it;
      }
    } catch (e) {}
    return null;
  }

  /* =========================== 六、样式 =========================== */

  const CSS = `
.eagle-bar-wrap{ display:inline-flex; align-items:center; flex:0 0 auto; margin-left:4px; gap:2px; }
.eagle-bar-btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:34.75px; height:34.75px; padding:0; margin:0; border:0; border-radius:9999px;
  background:transparent; cursor:pointer; flex:0 0 auto; transition:background .15s;
}
.eagle-bar-btn:hover{ background:rgba(59,155,255,.12); }
.eagle-bar-btn svg{ width:18.75px; height:18.75px; display:block; }
.eagle-bar-btn .eagle-badge{ fill:#3B9BFF; transition:fill .2s; }
.eagle-bar-btn:hover .eagle-badge{ fill:#5FB0FF; }
.eagle-bar-btn.eagle-saved .eagle-badge{ fill:#2ECC71; }
.eagle-bar-btn.eagle-busy .eagle-badge{ fill:#E3B341; }
.eagle-bar-btn.eagle-fail .eagle-badge{ fill:#F5386E; }
.eagle-bar-btn.eagle-gear svg{ width:17px; height:17px; }
.eagle-bar-btn.eagle-gear .gear-stroke{ stroke:#8b8f96; fill:none; stroke-width:1.7; transition:stroke .2s; }
.eagle-bar-btn.eagle-gear:hover .gear-stroke{ stroke:#5FB0FF; }

.eagle-toast{
  position:fixed; right:20px; bottom:20px; z-index:2147483001;
  background:rgba(28,29,33,.97); color:#eaeaea; border:1px solid #3a3b40;
  padding:10px 14px; border-radius:8px; font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;
  max-width:380px; box-shadow:0 6px 22px rgba(0,0,0,.45); white-space:pre-wrap;
}
.eagle-toast b{ color:#7ee787; }
.eagle-toast-btn{
  display:inline-block; padding:5px 12px; border-radius:6px; cursor:pointer;
  background:#3B9BFF; color:#fff !important; text-decoration:none !important; font-size:12px;
}
.eagle-toast-btn:hover{ background:#5FB0FF; }
.eagle-toast-btn + .eagle-toast-btn{ background:#3a3b40; }
.eagle-toast-btn + .eagle-toast-btn:hover{ background:#4a4b52; }

/* ===== 面板：对照 Eagle 官方的「收藏设置」浅色卡片风格 =====
   注意：z-index 用最大 32 位整数、关键属性加 !important。
   X 自己会创建高 z-index 的浮层，不加 !important 面板可能被压在下面（看起来像"没出现"）。 */
.eagle-panel-mask{
  position:fixed !important; inset:0 !important; top:0 !important; left:0 !important;
  width:100vw !important; height:100vh !important;
  background:rgba(0,0,0,.45) !important;
  z-index:2147483647 !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  font:13px/1.6 system-ui,"Segoe UI","Microsoft YaHei",sans-serif !important;
  direction:ltr !important;
}
.eagle-panel{
  width:560px; max-width:94vw; max-height:88vh; overflow:auto;
  background:#fff !important; color:#1a1a1a !important; border-radius:14px;
  box-shadow:0 20px 60px rgba(0,0,0,.35);
  text-align:left !important;
}
.eagle-panel-head{ display:flex; align-items:center; gap:10px; padding:16px 20px 10px; font-size:16px; font-weight:600; }
.eagle-panel-head svg{ width:20px; height:20px; flex:0 0 auto; }
.eagle-panel-body{ padding:4px 16px 18px; }
.eagle-card{ border:1px solid #e6e6e6; border-radius:12px; padding:14px 16px; margin-bottom:14px; background:#fafafa; }
.eagle-card-title{ font-size:13px; color:#666; margin-bottom:10px; }
.eagle-seg{ display:flex; gap:10px; }
.eagle-seg-item{
  flex:1; border:1px solid #e0e0e0; border-radius:10px; background:#fff;
  padding:10px 8px; text-align:center; cursor:pointer; transition:all .15s;
  display:flex; flex-direction:column; align-items:center; gap:6px;
}
.eagle-seg-item:hover{ border-color:#c9d9ee; }
.eagle-seg-item.on{ border-color:#3B9BFF; box-shadow:0 0 0 1px #3B9BFF inset; color:#3B9BFF; }
.eagle-seg-item .ico{ width:40px; height:30px; display:block; }
.eagle-seg-item .lbl{ font-size:12.5px; }
.eagle-row{ display:flex; align-items:flex-start; gap:14px; padding:11px 0; border-top:1px solid #ececec; }
.eagle-card .eagle-row:first-child{ border-top:0; padding-top:2px; }
.eagle-row .txt{ flex:1; min-width:0; }
.eagle-row .ttl{ font-size:13.5px; font-weight:600; color:#1a1a1a; }
.eagle-row .desc{ font-size:12.5px; color:#8a8a8a; margin-top:2px; }
.eagle-switch{ position:relative; width:44px; height:24px; flex:0 0 auto; margin-top:1px; }
.eagle-switch input{ opacity:0; width:0; height:0; position:absolute; }
.eagle-switch .slider{ position:absolute; inset:0; background:#d8d8d8; border-radius:999px; transition:background .2s; cursor:pointer; }
.eagle-switch .slider::before{
  content:""; position:absolute; width:18px; height:18px; left:3px; top:3px;
  background:#fff; border-radius:50%; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.25);
}
.eagle-switch input:checked + .slider{ background:#3B9BFF; }
.eagle-switch input:checked + .slider::before{ transform:translateX(20px); }
.eagle-tpl{
  width:100%; box-sizing:border-box; border:1px solid #dcdcdc; border-radius:9px;
  padding:9px 11px; font:12.5px/1.6 Consolas,monospace; color:#1a1a1a; background:#fff;
  resize:vertical; min-height:56px; outline:none;
}
.eagle-tpl:focus{ border-color:#3B9BFF; }
.eagle-ph{ display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
.eagle-ph span{
  border:1px solid #d5e3f5; background:#f2f7ff; color:#3B6FB5;
  border-radius:999px; padding:3px 11px; font-size:12px; cursor:pointer;
}
.eagle-ph span:hover{ background:#e3eeff; border-color:#3B9BFF; }
.eagle-preview{
  margin-top:10px; background:#f5f5f5; border:1px solid #e6e6e6; border-radius:9px;
  padding:9px 11px; font:12.5px/1.55 Consolas,monospace; color:#2b6cb0; word-break:break-all;
}
.eagle-panel-foot{ display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 20px 16px; border-top:1px solid #eee; }
.eagle-panel-foot .hint{ font-size:12px; color:#8a8a8a; }
.eagle-btn{ border-radius:9px; padding:9px 20px; font:13px/1 inherit; cursor:pointer; border:1px solid transparent; }
.eagle-btn.primary{ background:#3B9BFF; color:#fff; }
.eagle-btn.primary:hover{ background:#2f8ce8; }
.eagle-btn.ghost{ background:#fff; color:#555; border-color:#dcdcdc; }
.eagle-btn.ghost:hover{ border-color:#bbb; color:#222; }
`;

  function injectCSS() {
    if (document.getElementById("eagle-save-style")) return;
    const s = document.createElement("style");
    s.id = "eagle-save-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer = null;
  function toast(html, ms) {
    let e = document.getElementById("eagle-toast");
    if (!e) {
      e = el("div", "eagle-toast");
      e.id = "eagle-toast";
      document.body.appendChild(e);
      // 事件委托：提示里的任何 [data-eagle-open] 按钮都走这里。
      // 用委托而不是逐个绑定，避免"绑定时刻子元素还没生成"的问题，
      // 也不依赖浏览器对自定义协议 href 的处理。
      e.addEventListener("click", function (ev) {
        let n = ev.target;
        while (n && n !== e) {
          if (n.getAttribute && n.getAttribute("data-eagle-open")) {
            ev.preventDefault();
            ev.stopPropagation();
            openEagleItem(n.getAttribute("data-item-id"));
            return;
          }
          n = n.parentElement;
        }
      });
    }
    e.innerHTML = html;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => e.remove(), ms || 4000);
    return e;
  }

  /* =========================== 七、按钮 =========================== */

  const ICON_SVG = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path class="eagle-badge" d="M12 2.2 4.6 9.4c-.3.3-.3.7 0 1l2 2c.3.3.7.3 1 0L12 8.1l4.4 4.3c.3.3.7.3 1 0l2-2c.3-.3.3-.7 0-1z"/>
  <path class="eagle-badge" d="M3.2 15.1c0-.5.5-.9 1-.7l4.2 1.5c.5.2 1 .2 1.5 0l2.1-.9 2.1.9c.5.2 1 .2 1.5 0l4.2-1.5c.5-.2 1 .2 1 .7 0 3.3-2.7 6-6 6H9.2c-3.3 0-6-2.7-6-6z"/>
</svg>`;
  const GEAR_SVG = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g class="gear-stroke" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3.1"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10.1 3.05V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>
  </g>
</svg>`;

  function makeBarButton(article) {
    const wrap = el("div", "eagle-bar-wrap");

    const btn = el("button", "eagle-bar-btn", ICON_SVG);
    btn.type = "button";
    btn.title = "保存原视频/原图到 Eagle\n（右键切换是否弹出分类面板）";
    btn.setAttribute("aria-label", "保存媒体到 Eagle");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      handleClick(btn, article);
    });
    btn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const now = !getCfg("askCategory");
      setCfg("askCategory", now);
      toast("点击按钮" + (now ? "会先弹出<b>分类面板</b>" : "将<b>直接保存</b>，不再询问"));
    });
    wrap.appendChild(btn);

    const gear = el("button", "eagle-bar-btn eagle-gear", GEAR_SVG);
    gear.type = "button";
    gear.title = "Eagle 收藏设置（媒体类型、文件名格式等）";
    gear.setAttribute("aria-label", "Eagle 收藏设置");
    gear.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      openSettingsPanel(article);
    });
    wrap.appendChild(gear);

    return wrap;
  }

  function findActionBar(article) {
    if (!article) return null;
    try {
      const groups = article.querySelectorAll('div[role="group"]');
      for (const g of groups) {
        const btns = g.querySelectorAll("button");
        if (btns.length < 3) continue;
        let hit = 0;
        for (const b of btns) {
          const l = (b.getAttribute("aria-label") || "").toLowerCase();
          if (/reply|repost|like|bookmark|share|转发|回复|喜欢|书签|分享/.test(l)) hit++;
        }
        if (hit >= 2) return g;
      }
      return groups.length ? groups[groups.length - 1] : null;
    } catch (e) { return null; }
  }

  function collectTargets(article) {
    const out = [];
    if (getCfg("catchVideo")) for (const u of videosIn(article)) out.push({ type: "video", url: u });
    if (getCfg("catchImage")) for (const u of imagesIn(article)) out.push({ type: "image", url: u });
    return out;
  }

  function syncButton(btn, article) {
    if (!btn || !article) return;
    if (btn.classList.contains("eagle-busy")) return;
    btn.classList.remove("eagle-saved", "eagle-fail");
    const targets = collectTargets(article);
    if (targets.length && targets.every((t) => isSaved(t.url))) btn.classList.add("eagle-saved");
  }

  function syncAllButtons() {
    let articles = [];
    try { articles = Array.from(document.querySelectorAll("article")); } catch (e) { return; }
    for (const art of articles) {
      const wrap = art.querySelector(".eagle-bar-wrap");
      if (!wrap) continue;
      syncButton(wrap.querySelector(".eagle-bar-btn"), art);
    }
  }

  function injectAll() {
    injectCSS();
    let articles = [];
    try { articles = Array.from(document.querySelectorAll("article")); } catch (e) { return; }
    for (const art of articles) {
      if (art.querySelector(".eagle-bar-wrap")) continue;
      let has = false;
      try { has = !!art.querySelector("video") || !!art.querySelector('img[src*="pbs.twimg.com/media/"]'); } catch (e) {}
      if (!has) continue;
      const bar = findActionBar(art);
      if (!bar) continue;
      const wrap = makeBarButton(art);
      try { bar.appendChild(wrap); } catch (e) { continue; }
      syncButton(wrap.querySelector(".eagle-bar-btn"), art);
    }
  }

  /* =========================== 八、点击行为 =========================== */

  async function handleClick(btn, article) {
    if (btn.classList.contains("eagle-busy")) return;
    const targets = collectTargets(article);
    if (!targets.length) {
      let vids = 0;
      try { vids = article.querySelectorAll("video").length; } catch (e) {}
      btn.classList.add("eagle-fail");
      toast(
        (vids ? "视频地址还没抓到，请先点一下播放，等 2 秒再试。" : "这条推文里没找到可收藏的媒体。") +
          "<br><span style='color:#888'>可点旁边的齿轮检查「收藏哪些媒体」设置</span>"
      );
      setTimeout(() => btn.classList.remove("eagle-fail"), 2500);
      return;
    }
    if (getCfg("askCategory")) {
      openCategoryPanel(targets, article, async (extra) => { await doSaveAll(btn, targets, article, extra); });
    } else {
      await doSaveAll(btn, targets, article, null);
    }
  }

  async function doSaveAll(btn, targets, article, extra) {
    btn.classList.add("eagle-busy");
    const total = targets.length;
    toast("正在保存到 Eagle…（共 " + total + " 项）");

    const results = [];   // { index, url, name, item, error }
    let doneCount = 0;

    /* 第 1 阶段：逐个提交。
       刻意把"提交"和"确认"分开：
         - 若在提交循环里就 await 确认，第 1 项要等最多 45 秒，
           期间看起来像"只下了第一个"，而且中途出问题会连累后面的项。
         - 先全部提交完，再统一确认，能保证"点一次 = 全部送出去"。 */
    for (let i = 0; i < total; i++) {
      const t = targets[i];
      const baseName = (extra && extra.name && total === 1) ? extra.name : buildName(article, t.url);
      const name = applySeq(baseName, i, total);
      toast("正在提交到 Eagle…（" + (i + 1) + "/" + total + "）\n" + escapeHtml(name.slice(0, 80)));
      try {
        const r = await submitOne(t.url, name, extra);
        if (r && r.started) {
          results.push({ index: i, url: t.url, name, item: null, error: null });
        } else {
          results.push({ index: i, url: t.url, name, item: null, error: (r && r.error) || "提交失败" });
        }
      } catch (e) {
        results.push({ index: i, url: t.url, name, item: null, error: e.message });
      }
      if (i < total - 1) await sleep(SUBMIT_GAP_MS);
    }

    const failedSubmit = results.filter((r) => r.error);
    log("提交阶段完成：成功 " + (total - failedSubmit.length) + " / " + total);

    /* 第 2 阶段：逐个确认（Eagle 是异步下载，先回 200） */
    if (!failedSubmit.length) {
      toast("已全部提交，正在等 Eagle 下载完成…（共 " + total + " 项）");
    }
    for (const r of results) {
      if (r.error) continue;
      const info = await confirmOne(r.url);
      r.item = info.item;
      if (info.ok) doneCount++;
      else r.error = "没有出现在库里（可能网络超时或链接失效）";
    }

    btn.classList.remove("eagle-busy");
    const okItems = results.filter((r) => r.item).map((r) => r.item);
    const badList = results.filter((r) => !r.item);

    if (okItems.length && !badList.length) {
      btn.classList.add("eagle-saved");
      showSavedToast(okItems, total);
    } else if (okItems.length) {
      btn.classList.add("eagle-saved");
      const detail = badList
        .slice(0, 3)
        .map((r) => "· " + escapeHtml(String(r.name || r.url).slice(0, 40)) + "：" + escapeHtml(r.error || "失败"))
        .join("<br>");
      toast(
        "<b>部分保存成功</b>　成功 " + okItems.length + " / " + total +
          "<br><span style='color:#e3b341'>以下 " + badList.length + " 项没成功：</span><br>" +
          detail +
          (badList.length > 3 ? "<br>…" : ""),
        12000
      );
    } else {
      btn.classList.add("eagle-fail");
      const reason = badList[0] && (badList[0].error || "未知原因");
      toast(
        "Eagle 没有保存成功。<br><span style='color:#bbb'>" + escapeHtml(String(reason).slice(0, 120)) + "</span><br>" +
          "<span style='color:#888'>共 " + total + " 项都没成功</span>",
        10000
      );
      setTimeout(() => btn.classList.remove("eagle-fail"), 3000);
    }
  }

  // 只负责"把任务交给 Eagle"，不等下载完成
  async function submitOne(url, name, extra) {
    try {
      const r = await saveToEagle(url, name, extra);
      if (!r || (r.status !== "success" && r.status !== undefined)) {
        return { started: false, error: "Eagle 返回：" + JSON.stringify(r).slice(0, 120) };
      }
      return { started: true };
    } catch (e) {
      return { started: false, error: e.message };
    }
  }

  // 轮询确认某个媒体是否真的进了库
  async function confirmOne(url) {
    const key = mediaKey(url);
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    let found = await findByKey(key);
    while (!found && Date.now() < deadline) {
      await sleep(CONFIRM_INTERVAL_MS);
      found = await findByKey(key);
      if (found) break;
      libraryLoaded = false;
      await loadLibraryIndex();
      found = await findByKey(key);
    }
    if (found && key) savedIds.add(key);
    return { ok: !!found, item: found };
  }

  function showSavedToast(items, total) {
    const first = items[0];
    let html = "<b>已保存到 Eagle</b>" + (items.length > 1 ? "（共 " + items.length + " 项）" : "") + "<br>";
    html += "<span style='color:#bbb'>" + escapeHtml(String((first && first.name) || "").slice(0, 70)) + "</span>";
    const links = items.slice(0, 5).map((it) =>
      "<a class='eagle-toast-btn' data-eagle-open='1' data-item-id='" + escapeHtml(it.id) + "' " +
      "href='eagle://item/" + escapeHtml(it.id) + "'>" +
      (items.length > 1 ? "打开" : "在 Eagle 中打开") + "</a>"
    ).join(" ");
    html += "<div style='margin-top:8px;display:flex;gap:8px;flex-wrap:wrap'>" + links + "</div>";
    toast(html, 12000);
    if (getCfg("autoOpen") && first && first.id) {
      setTimeout(() => openEagleItem(first.id), 700);
    }
  }

  function openEagleItem(id) {
    if (!id) return;
    const href = "eagle://item/" + id;
    try {
      const a = document.createElement("a");
      a.href = href;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 0);
    } catch (e) {
      try { window.open(href, "_self"); } catch (e2) { log("打开 Eagle 失败", e2.message); }
    }
  }

  /* =========================== 九、设置面板 =========================== */

  const PLACEHOLDERS = [
    ["{user-name}", "显示名"],
    ["{user-id}", "用户名"],
    ["{status-id}", "推文ID"],
    ["{date-time}", "时间"],
    ["{full-text}", "推文内容"],
    ["{file-name}", "文件名"],
    ["{file-type}", "扩展名"],
  ];

  const HEAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2.5" y="3.5" width="19" height="17" rx="3"/><path d="M3 8h4l2 2h12"/><path d="M3 16h11l2-2h5"/>
  <circle cx="8" cy="8" r="1.5" fill="#1a1a1a" stroke="none"/><circle cx="16" cy="16" r="1.5" fill="#1a1a1a" stroke="none"/></svg>`;

  function segIcon(kind) {
    const box = (inner, stroke) =>
      `<svg class="ico" viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="38" height="28" rx="5" fill="#fff" stroke="${stroke || "#dcdcdc"}"/>
        ${inner}</svg>`;
    if (kind === "video") return box(`<rect x="7" y="7" width="15" height="16" rx="2.5" fill="#eef3f9" stroke="#bcc9d9"/><path d="M24 15l9 5.5-9 5.5z" fill="#3B9BFF"/>`);
    if (kind === "image") return box(`<circle cx="12" cy="11" r="2.6" fill="#3B9BFF"/><path d="M5 24l8-9 6 6 4-3 12 6z" fill="#cfe0f5"/>`);
    if (kind === "all") return box(`<path d="M5 24l7-8 5 5 4-3 14 6z" fill="#cfe0f5"/><circle cx="11" cy="11" r="2.4" fill="#3B9BFF"/><rect x="25" y="6" width="10" height="9" rx="2" fill="#3B9BFF"/>`);
    return box(`<circle cx="20" cy="15" r="8.5" fill="none" stroke="#c2c2c2" stroke-width="2"/><path d="M14 9l12 12" stroke="#c2c2c2" stroke-width="2"/>`);
  }

  function rowSwitch(title, desc, checked, onChange) {
    const row = el("div", "eagle-row");
    const txt = el("div", "txt");
    txt.appendChild(el("div", "ttl", escapeHtml(title)));
    if (desc) txt.appendChild(el("div", "desc", escapeHtml(desc)));
    row.appendChild(txt);
    const sw = el("label", "eagle-switch");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!checked;
    input.addEventListener("change", () => onChange(input.checked));
    sw.appendChild(input);
    sw.appendChild(el("span", "slider"));
    row.appendChild(sw);
    return row;
  }

  function openSettingsPanel(article) {
    const old = document.getElementById("eagle-panel-mask");
    if (old) old.remove();

    const mask = el("div", "eagle-panel-mask");
    mask.id = "eagle-panel-mask";
    const panel = el("div", "eagle-panel");

    const head = el("div", "eagle-panel-head");
    head.innerHTML = HEAD_ICON + "<span>收藏设置</span>";
    panel.appendChild(head);

    const body = el("div", "eagle-panel-body");

    /* 卡片 1：收藏哪些媒体（分段卡片，对照官方"弹窗式/吸底式/禁用"） */
    const card1 = el("div", "eagle-card");
    card1.appendChild(el("div", "eagle-card-title", "收藏哪些媒体"));
    const seg = el("div", "eagle-seg");
    const SEGS = [
      { key: "all", label: "视频 + 图片", v: true, i: true },
      { key: "video", label: "仅视频", v: true, i: false },
      { key: "image", label: "仅图片", v: false, i: true },
      { key: "none", label: "禁用", v: false, i: false },
    ];
    function currentSegKey() {
      const v = !!getCfg("catchVideo"), i = !!getCfg("catchImage");
      const s = SEGS.find((x) => x.v === v && x.i === i);
      return s ? s.key : "all";
    }
    const segEls = [];
    for (const s of SEGS) {
      const item = el("div", "eagle-seg-item" + (currentSegKey() === s.key ? " on" : ""));
      item.innerHTML = segIcon(s.key) + '<span class="lbl">' + s.label + "</span>";
      item.addEventListener("click", () => {
        setCfg("catchVideo", s.v);
        setCfg("catchImage", s.i);
        segEls.forEach((x) => x.el.classList.toggle("on", x.s.key === s.key));
        hint.textContent = "已设为：" + s.label;
        scheduleSync();
        updatePreview();
      });
      segEls.push({ el: item, s: s });
      seg.appendChild(item);
    }
    card1.appendChild(seg);
    body.appendChild(card1);

    /* 卡片 2：文件名格式 */
    const card2 = el("div", "eagle-card");
    card2.appendChild(el("div", "eagle-card-title", "文件名格式"));
    const tpl = el("textarea", "eagle-tpl");
    tpl.spellcheck = false;
    tpl.value = getCfg("nameTemplate") || DEFAULT_TEMPLATE;
    card2.appendChild(tpl);

    const phBox = el("div", "eagle-ph");
    for (const [ph, label] of PLACEHOLDERS) {
      const chip = el("span", null, escapeHtml(ph));
      chip.title = label + "（点击插入）";
      chip.addEventListener("click", () => {
        const s = tpl.selectionStart == null ? tpl.value.length : tpl.selectionStart;
        const e2 = tpl.selectionEnd == null ? tpl.value.length : tpl.selectionEnd;
        tpl.value = tpl.value.slice(0, s) + ph + tpl.value.slice(e2);
        tpl.focus();
        tpl.selectionStart = tpl.selectionEnd = s + ph.length;
        updatePreview();
      });
      phBox.appendChild(chip);
    }
    card2.appendChild(phBox);
    const preview = el("div", "eagle-preview");
    card2.appendChild(preview);
    body.appendChild(card2);

    /* 卡片 3：行为 */
    const card3 = el("div", "eagle-card");
    card3.appendChild(rowSwitch("保存前弹出分类面板", "点击 Eagle 按钮时先选文件夹、加标签、写注释。", getCfg("askCategory"), (v) => setCfg("askCategory", v)));
    card3.appendChild(rowSwitch("收藏引用推文里的媒体", "推文里引用了别人的推文时，是否把引用内容里的视频/图片也一起收藏。默认关闭。", getCfg("catchQuoteImage"), (v) => {
      setCfg("catchQuoteImage", v);
      scheduleSync();
      updatePreview();
    }));
    card3.appendChild(rowSwitch("记住上次选择的文件夹与标签", "下次打开分类面板时自动带上。", getCfg("rememberFolder"), (v) => setCfg("rememberFolder", v)));
    card3.appendChild(rowSwitch("保存成功后自动在 Eagle 中打开", "用 eagle:// 协议跳到刚收藏的那一项。", getCfg("autoOpen"), (v) => setCfg("autoOpen", v)));
    body.appendChild(card3);

    panel.appendChild(body);

    const foot = el("div", "eagle-panel-foot");
    const hint = el("div", "hint", "设置会立即保存");
    foot.appendChild(hint);
    const right = el("div", null, "");
    right.style.display = "flex";
    right.style.gap = "10px";
    const resetBtn = el("button", "eagle-btn ghost", "恢复默认");
    resetBtn.type = "button";
    const okBtn = el("button", "eagle-btn primary", "完成");
    okBtn.type = "button";
    right.appendChild(resetBtn);
    right.appendChild(okBtn);
    foot.appendChild(right);
    panel.appendChild(foot);

    mask.appendChild(panel);
    document.body.appendChild(mask);

    const switchInputs = panel.querySelectorAll(".eagle-switch input");

    function updatePreview() {
      const tg = collectTargets(article);
      const sample = tg.length ? tg[0].url : "";
      try {
        const ext = sample && /pbs\.twimg\.com/.test(sample) ? "jpg" : sample ? "mp4" : "jpg";
        preview.textContent = renderTemplate(tpl.value, metaForArticle(article, sample)) + "." + ext;
      } catch (e) {
        preview.textContent = "(预览失败: " + e.message + ")";
      }
    }
    tpl.addEventListener("input", updatePreview);
    tpl.addEventListener("change", () => {
      setCfg("nameTemplate", tpl.value.trim() || DEFAULT_TEMPLATE);
      hint.textContent = "文件名格式已保存";
    });
    updatePreview();

    resetBtn.addEventListener("click", () => {
      for (const k of Object.keys(DEFAULTS)) {
        if (k !== "lastFolderId" && k !== "lastTags") setCfg(k, DEFAULTS[k]);
      }
      tpl.value = DEFAULT_TEMPLATE;
      const vals = [getCfg("askCategory"), getCfg("catchQuoteImage"), getCfg("rememberFolder"), getCfg("autoOpen")];
      const arr = Array.prototype.slice.call(switchInputs);
      arr.forEach((inp, i) => { if (vals[i] !== undefined) inp.checked = !!vals[i]; });
      const cur = currentSegKey();
      segEls.forEach((x) => x.el.classList.toggle("on", x.s.key === cur));
      hint.textContent = "已恢复默认";
      updatePreview();
      scheduleSync();
    });

    function close() {
      setCfg("nameTemplate", tpl.value.trim() || DEFAULT_TEMPLATE);
      mask.remove();
      document.removeEventListener("keydown", onKey, true);
      scheduleSync();
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    okBtn.addEventListener("click", close);
  }

  /* =========================== 十、分类面板 =========================== */

  let foldersCache = null;
  let tagsCache = null;

  async function getFolders() {
    if (foldersCache) return foldersCache;
    try { foldersCache = ((await apiGet("/api/folder/list")) || {}).data || []; } catch (e) { foldersCache = []; }
    return foldersCache;
  }
  async function getTags() {
    if (tagsCache) return tagsCache;
    try { tagsCache = ((await apiGet("/api/tag/list")) || {}).data || []; } catch (e) { tagsCache = []; }
    return tagsCache;
  }
  function flattenFolders(list, depth) {
    const out = [];
    for (const f of list || []) {
      if (!f) continue;
      out.push({ id: f.id, name: (depth ? "　".repeat(depth) + "└ " : "") + (f.name || "未命名") });
      if (f.children && f.children.length) out.push(...flattenFolders(f.children, depth + 1));
    }
    return out;
  }

  function openCategoryPanel(targets, article, onConfirm) {
    const old = document.getElementById("eagle-cat-mask");
    if (old) old.remove();

    const mask = el("div", "eagle-panel-mask");
    mask.id = "eagle-cat-mask";
    const panel = el("div", "eagle-panel");
    const head = el("div", "eagle-panel-head");
    head.innerHTML = HEAD_ICON + "<span>保存到 Eagle（" + targets.length + " 项）</span>";
    panel.appendChild(head);

    const body = el("div", "eagle-panel-body");
    const card = el("div", "eagle-card");

    const mkField = (labelText, node) => {
      const f = el("div", null, "");
      f.style.marginBottom = "13px";
      const lb = el("div", "eagle-card-title", escapeHtml(labelText));
      lb.style.marginBottom = "6px";
      f.appendChild(lb);
      f.appendChild(node);
      return f;
    };

    const nameInput = el("input", "eagle-tpl");
    nameInput.type = "text";
    nameInput.style.fontFamily = "inherit";
    nameInput.style.minHeight = "0";
    nameInput.value = targets.length === 1 ? buildName(article, targets[0].url) : "";
    if (targets.length > 1) nameInput.placeholder = "多项时按文件名格式自动生成";
    card.appendChild(mkField("文件名", nameInput));

    const folderSel = document.createElement("select");
    folderSel.className = "eagle-tpl";
    folderSel.style.fontFamily = "inherit";
    folderSel.style.minHeight = "0";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "（不指定 · 存到「全部」）";
    folderSel.appendChild(opt0);
    card.appendChild(mkField("文件夹", folderSel));

    const tagInput = el("input", "eagle-tpl");
    tagInput.type = "text";
    tagInput.style.fontFamily = "inherit";
    tagInput.style.minHeight = "0";
    tagInput.placeholder = "输入后按回车添加";
    card.appendChild(mkField("标签", tagInput));

    const tagSet = new Set(String(getCfg("lastTags") || "").split(",").map((s) => s.trim()).filter(Boolean));
    const chipBox = el("div", "eagle-ph");
    card.appendChild(chipBox);
    function renderChips() {
      chipBox.innerHTML = "";
      for (const t of tagSet) {
        const c = el("span", null, escapeHtml(t) + " ✕");
        c.title = "点击移除";
        c.addEventListener("click", () => { tagSet.delete(t); renderChips(); });
        chipBox.appendChild(c);
      }
    }
    renderChips();
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = tagInput.value.trim().replace(/,$/, "");
        if (v) { tagSet.add(v); tagInput.value = ""; renderChips(); }
      }
    });

    const anno = document.createElement("textarea");
    anno.className = "eagle-tpl";
    anno.style.fontFamily = "inherit";
    anno.style.minHeight = "50px";
    anno.placeholder = "给这条素材写点备注（可选）";
    card.appendChild(mkField("注释", anno));

    body.appendChild(card);
    panel.appendChild(body);

    const foot = el("div", "eagle-panel-foot");
    const hint = el("div", "hint", "加载文件夹中…");
    foot.appendChild(hint);
    const right = el("div", null, "");
    right.style.display = "flex";
    right.style.gap = "10px";
    const cancel = el("button", "eagle-btn ghost", "取消");
    cancel.type = "button";
    const ok = el("button", "eagle-btn primary", "保存");
    ok.type = "button";
    right.appendChild(cancel);
    right.appendChild(ok);
    foot.appendChild(right);
    panel.appendChild(foot);

    mask.appendChild(panel);
    document.body.appendChild(mask);

    getFolders().then((raw) => {
      const flat = flattenFolders(raw, 0);
      for (const f of flat) {
        const o = document.createElement("option");
        o.value = f.id;
        o.textContent = f.name;
        folderSel.appendChild(o);
      }
      const last = String(getCfg("lastFolderId") || "");
      if (last && flat.some((f) => f.id === last)) folderSel.value = last;
      hint.textContent = flat.length ? flat.length + " 个文件夹" : "没读到文件夹列表";
      getTags().then((tags) => {
        const names = (tags || []).map((t) => (t && t.name) || "").filter(Boolean).slice(0, 12);
        for (const n of names) {
          if (tagSet.has(n)) continue;
          const c = el("span", null, "+ " + escapeHtml(n));
          c.addEventListener("click", () => { tagSet.add(n); renderChips(); });
          chipBox.appendChild(c);
        }
      });
    });

    function close() { mask.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
    cancel.addEventListener("click", close);

    ok.addEventListener("click", async () => {
      const extra = {
        folderId: folderSel.value,
        tags: Array.from(tagSet),
        annotation: anno.value.trim(),
        name: nameInput.value.trim(),
      };
      if (getCfg("rememberFolder")) {
        setCfg("lastFolderId", extra.folderId);
        setCfg("lastTags", extra.tags.join(","));
      }
      close();
      await onConfirm(extra);
    });
  }

  /* =========================== 十一、启动 =========================== */

  let syncTimer = null;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      injectAll();
      syncAllButtons();
    }, 350);
  }

  function boot() {
    log("脚本已加载 v3.1（视频 + 图片 + 命名模板）");
    injectCSS();
    loadLibraryIndex();
    scanScripts();
    scanPerformance();
    scanDomImages();
    injectAll();
    setInterval(() => { scanPerformance(); scanScripts(); scanDomImages(); injectAll(); }, 2500);
    setInterval(syncAllButtons, 4000);
    registerMenu();
  }

  // 除了操作栏的齿轮，再挂一个 Tampermonkey 菜单入口（参考脚本也是用菜单打开的，更可靠）
  function registerMenu() {
    try {
      if (typeof GM_registerMenuCommand !== "function") return;
      GM_registerMenuCommand("⚙ Eagle 收藏设置", function () {
        const art = document.querySelector("article");
        openSettingsPanel(art);
      });
      GM_registerMenuCommand("📋 打开分类面板并保存这条推文", function () {
        const art = document.querySelector("article");
        if (!art) return;
        const btn = art.querySelector(".eagle-bar-btn");
        if (btn) btn.click();
        else toast("没找到推文，请先打开一条带媒体（视频/图片）的推文");
      });
      GM_registerMenuCommand("🔍 诊断（复制结果发给作者）", function () {
        try {
          const d = window.__eagleMedia.diag();
          const txt = JSON.stringify(d, null, 2);
          if (navigator.clipboard) navigator.clipboard.writeText(txt);
          console.log("[Eagle媒体] 诊断结果：\n" + txt);
          alert("诊断结果已输出到控制台（并尝试复制到剪贴板）：\n\n" + txt);
        } catch (e) {
          alert("诊断失败：" + e.message);
        }
      });
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__eagleMedia = {
    videos: () => Array.from(mediaIdToUrl.entries()),
    images: () => Array.from(imageUrlSet),
    targets: (a) => collectTargets(a || document.querySelector("article")),
    toOriginalImage,
    rescan: () => { scanScripts(); scanPerformance(); scanDomImages(); injectAll(); },
    save: (u, extra) => saveToEagle(u, buildName(document.querySelector("article"), u), extra),
    saved: () => Array.from(libraryIndex),
    setAsk: (v) => setCfg("askCategory", !!v),
    getAsk: () => getCfg("askCategory"),
    cfg: () => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, getCfg(k)])),
    openSettings: () => openSettingsPanel(document.querySelector("article")),
    // 供测试覆盖：调小确认超时，避免测试里等 45 秒
    setConfirmTimeout: (ms, intervalMs) => {
      if (ms) CONFIRM_TIMEOUT_MS = ms;
      if (intervalMs) CONFIRM_INTERVAL_MS = intervalMs;
    },
    reloadLibrary: () => { libraryLoaded = false; libraryIndex.clear(); return loadLibraryIndex(); },
    // 诊断：一次性打印关键状态，用于排查"面板没出现""按钮没出现"
    diag: () => {
      const articles = Array.from(document.querySelectorAll("article"));
      const withMedia = articles.filter((a) => {
        try { return !!a.querySelector("video") || !!a.querySelector('img[src*="pbs.twimg.com/media/"]'); } catch (e) { return false; }
      });
      const styleEl = document.getElementById("eagle-save-style");
      const mask = document.getElementById("eagle-panel-mask");
      const gear = document.querySelector(".eagle-gear");
      let gearInfo = null;
      if (gear) {
        const r = gear.getBoundingClientRect();
        const cs = getComputedStyle(gear);
        gearInfo = {
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
          parentClass: gear.parentElement && gear.parentElement.className,
        };
      }
      return {
        version: "3.1.0",
        url: location.href,
        styleInjected: !!styleEl,
        styleLength: styleEl ? styleEl.textContent.length : 0,
        articles: articles.length,
        articlesWithMedia: withMedia.length,
        barWraps: document.querySelectorAll(".eagle-bar-wrap").length,
        gearFound: !!gear,
        gear: gearInfo,
        panelOpen: !!mask,
        panelZ: mask ? getComputedStyle(mask).zIndex : null,
        cfg: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, getCfg(k)])),
      };
    },
  };
})();
