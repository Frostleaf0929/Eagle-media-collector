# Eagle Media Collector

把 X/Twitter 的原视频、原图**一键存进 [Eagle](https://eagle.cool/)**，不用先下载再导入。

本项目包含两个独立部分：

| 部分 | 作用 | 需要的环境 |
| --- | --- | --- |
| **用户脚本** `save-twitter-media-to-eagle.user.js` | 在推文操作栏加一个 Eagle 按钮，点一下把原视频/原图存进 Eagle | Tampermonkey（或同类的用户脚本管理器） |
| **扩展补丁** `patches/` | 给 Eagle 官方浏览器扩展加一个「拖拽时获取原图」开关 | 已安装 Eagle 官方扩展 |

---

## 一、用户脚本（推荐，功能最全）

### 能做什么

- **一键收藏原视频**：从 X 的接口数据里取出**最高码率**的 mp4，不是页面上播放的那个片段
- **一键收藏原图**：把缩略图地址改写成 `?name=orig` 拿原图
- **一条推文里的视频和图片会一起收藏**
- **自定义文件名**：可视化设置面板，支持 7 个占位符

  | 占位符 | 含义 |
  | --- | --- |
  | `{user-name}` | 显示名 |
  | `{user-id}` | 用户名（handle） |
  | `{status-id}` | 推文 ID |
  | `{date-time}` | 推文时间 |
  | `{full-text}` | 推文正文 |
  | `{file-name}` | 原文件名 |
  | `{file-type}` | 扩展名 |

- **多个文件自动加序号**：`名字-01`、`名字-02`，不会互相覆盖
- **可选分类面板**：保存前选文件夹、加标签、写注释
- **已收藏过的会变绿色**，避免重复收藏
- **保存成功后可直接跳转到 Eagle 对应条目**

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Zen / Firefox / Edge 均可）
2. 打开本仓库的 `save-twitter-media-to-eagle.user.js`
3. 点 **Raw**，Tampermonkey 会弹出安装页 → 点「安装」

> 或者在 Tampermonkey 面板 → 实用工具 → 从 URL 安装，粘贴 Raw 链接。

### 使用

1. 打开一条带视频或图片的推文
2. **如果是视频，先点一下播放**（这样才拿得到视频文件地址）
3. 点推文下方操作栏里那个**蓝色 Eagle 图标**
4. 旁边的**齿轮**按钮是设置（媒体类型、文件名格式、分类面板等）

> Tampermonkey 菜单里也有入口：「⚙ Eagle 收藏设置」、「🔍 诊断」。

### 需要的前提

脚本通过 Eagle 的**本地 Web API**（`http://localhost:41595`）把任务交给 Eagle，
所以 **Eagle 必须在运行**。

---

## 二、扩展补丁：拖拽时获取原图

Eagle 官方扩展拖拽图片时，有时存下来的是**页面上的缩略图**而不是原图。
这个补丁给扩展加一个开关，**打开后拖拽直接拿原图**。

### 补丁做了什么

1. 新增一个不依赖网络探测的 URL 改写方法（原版靠 HEAD 请求探测原图是否存在，会超时）
2. 新增 `dragToOriginal` 偏好项，在扩展的**收藏设置**里显示为一个开关
3. 开关打开时跳过 base64 路径（否则缩略图字节会覆盖掉改写好的原图地址）

### 怎么用

**Edge / Chrome 版：**

```bash
# 需要先安装官方 Eagle for Edge / Chrome 扩展
node patches/patch-edge-extension.js
```

脚本会自动找到你本机已安装的扩展，复制一份到 `eagle-original-drag-clean/` 并打补丁。
然后：

1. 打开 `edge://extensions/`
2. 开启左下角「开发人员模式」
3. 点「加载解压缩的扩展」，选择 `eagle-original-drag-clean` 文件夹
4. 点扩展图标 → 设置 → 打开「拖拽时获取原图」

**Zen / Firefox 版：**

需要先把 Zen 里的 Eagle 扩展解压出来：

1. 找到 `%APPDATA%\zen\Profiles\<你的配置>\extensions\{228a49ed-af0c-452c-bc77-630f99cb0470}.xpi`
2. 把它解压到本目录下的 `zen-eagle-ext\` 文件夹
3. 运行：

```bash
node patches/patch-zen-extension.js
```

4. 把生成的 `zen-eagle-original-drag\` 打包成 `.xpi`（或直接以临时扩展加载）

> Zen 侧载未签名扩展需要 `@Manual_CRXInstaller` 之类的辅助扩展，或从 `about:debugging` 临时加载。

### 回滚

- Edge：在 `edge://extensions/` 里移除加解压的那个扩展即可，**不影响商店原版**
- Zen：删掉你侧载的那个扩展，商店/AMO 原版不受影响

---

## 三、为什么不直接提供改好的扩展包

补丁版扩展里 **97.7% 的文件是 Eagle 自己的代码**（Edge 版 616 个文件里只改了 15 个）。
直接再分发整包会涉及 Eagle 的授权问题，所以本仓库**只提供补丁逻辑**，
用你自己机器上那份扩展作为输入。

---

## 已知限制

- 只支持 X / Twitter（包括 fixupx / fxtwitter / vxtwitter 这类镜像站）
- **视频需要先播放过一次**才能拿到文件地址（X 用的是 MSE 流，地址出现在网络层）
- 引用推文里的媒体默认**不收藏**（设置面板里可以打开）
- HLS / m3u8 分片流会被跳过，避免存进坏文件
- 作者无法在部分网络环境下访问 `greasyfork.org`，如遇安装问题请用 GitHub Raw 链接

## 许可

MIT，见 [LICENSE](LICENSE)。

## 致谢

- [Eagle](https://eagle.cool/) —— 本项目的目标应用
- 参考了 [Twitter Media Downloader](https://greasyfork.org/en/scripts/423001-twitter-media-downloader) 的控制面板思路
