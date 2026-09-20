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

直接安装链接（**注意仓库名 `Eagle-media-collector` 的 `E` 要大写**，
`raw.githubusercontent.com` 不跟随 GitHub 的重定向，小写会 404）：

```text
https://raw.githubusercontent.com/Frostleaf0929/Eagle-media-collector/main/save-twitter-media-to-eagle.user.js
```

> **文件名和仓库名为什么不一样？**
> 仓库名 `Eagle-media-collector` 是**整个项目**的名字（含用户脚本 + 扩展补丁两部分）；
> 脚本文件名 `save-twitter-media-to-eagle.user.js` 是**描述它自己做什么**。
> 两者刻意不重名，这样你在 Tampermonkey 的脚本列表里一眼能认出它是干什么的。
> 脚本的 `@namespace` 指向本仓库，就是它和本项目的关系凭据。

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

> **重要**：补丁脚本按 Eagle 扩展某个版本的代码结构做字符串替换，**是版本相关的**。
> 如果 Eagle 更新后改了这些位置，脚本会报「锚点未命中」并以退出码 `1` 结束。
> 这时它**仍然会写出一份打了部分补丁的副本**（供你排查用），但**不会碰你已安装的扩展** ——
> 请**不要**去加载那份不完整的副本，需要按报错调整锚点（欢迎提 issue）。

**Edge / Chrome 版：**

```bash
# 需要先安装官方 Eagle for Edge / Chrome 扩展
node patches/patch-edge-extension.js
```

脚本会自动找到你本机已安装的扩展，**复制一份到脚本目录下的 `eagle-original-drag-clean/`** 再打补丁。
你原来装的那份扩展不会被改动。

> 已验证的版本：Eagle for Edge **3.1.26**（MV3，`background-v3.js`）。
> 其他版本若锚点结构不同，脚本会报错并拒绝给出「成功」。

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

4. 把生成的 `zen-eagle-original-drag\` 打包成 `.xpi`

   打包时**注意**：Windows 自带的 PowerShell `Compress-Archive` 写出的条目名用的是反斜杠 `\`，
   而 ZIP 规范要求正斜杠 `/`，这样打出来的 XPI 可能无法安装。推荐用 .NET 的
   `ZipFile::CreateFromDirectory`，或直接用 7-Zip / Bandizip 这类工具压缩。

   同样注意：生成的 XPI 里**根目录必须直接是 `manifest.json`**，不要多套一层文件夹。

> **未签名 XPI 在 Zen 里装不上**。Zen 是 release 渠道，`xpinstall.signatures.required`
> 自 Firefox 48 起就无法在 release / beta 里用 `about:config` 关闭
> （[Mozilla 说明](https://blog.mozilla.org/addons/2016/07/29/extension-signing-availability-of-unbranded-builds/)）。
> 可行办法只有两条：
>
> - **临时加载**（推荐、免费）：打开 `about:debugging#/runtime/this-firefox` → 点「临时载入附加组件」→
>   选中 `zen-eagle-original-drag/manifest.json`（选这个文件本身，不用先打包）。
>   **每次重启 Zen 后要重新载入一次**。
> - **拿去 AMO 签名**：上传到 [addons.mozilla.org](https://addons.mozilla.org/developers/)
>   走「自主分发（unlisted）」通道，签完即可永久安装。

### 回滚

- Edge：在 `edge://extensions/` 里移除加载的那个扩展即可，**不影响商店原版**
- Zen：临时加载的在 Zen 重启后自动消失；AMO 签名装的在 `about:addons` 里移除，
  商店 / AMO 上那份原版不受影响

---

## 三、为什么不直接提供改好的扩展包

补丁版扩展里 **97.6% 的文件是 Eagle 自己的代码**（Edge 版 616 个文件里只改了 15 个）。
直接再分发整包会涉及 Eagle 的授权问题，所以本仓库**只提供补丁逻辑**，
用你自己机器上那份扩展作为输入。

---

## 已知限制

- 只支持 X / Twitter（包括 fixupx / fxtwitter / vxtwitter 这类镜像站）
- **视频需要先播放过一次**才能拿到文件地址（X 用的是 MSE 流，地址出现在网络层）
- 引用推文里的媒体默认**不收藏**（设置面板里可以打开）
- HLS / m3u8 分片流会被跳过，避免存进坏文件
- 作者无法在部分网络环境下访问 `greasyfork.org`，如遇安装问题请用 GitHub Raw 链接

## 开发说明

本项目**主要由 DSH（DeepSeek Harness）编写**。

- 用户脚本（`save-twitter-media-to-eagle.user.js`）：从需求分析、逆向 X 的网络数据格式、
  到设置面板与全部测试，均由 DSH 编写
- 扩展补丁（`patches/`）：补丁逻辑与锚点定位均由 DSH 编写
- 需求、验证与实机测试由仓库作者（Frostleaf0929）提出与执行

> 开发过程中也保留了完整的测试与踩坑记录，欢迎参考。

## 发布信息

Greasy Fork 脚本页要用的文案在 [`docs/greasy-fork-description.md`](docs/greasy-fork-description.md)，
可直接复制粘贴。

## 许可

MIT，见 [LICENSE](LICENSE)。

## 致谢

- [Eagle](https://eagle.cool/) —— 本项目的目标应用
- [DSH（DeepSeek Harness）](https://github.com/deepseek-ai) —— 本项目主要开发者
- 参考了 [Twitter Media Downloader](https://greasyfork.org/en/scripts/423001-twitter-media-downloader) 的控制面板思路

