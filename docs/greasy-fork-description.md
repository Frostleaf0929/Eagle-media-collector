# Greasy Fork 脚本页：可直接粘贴的文案

> **先分清两个「描述」—— 它们不是一回事，但共用同一份数据**：
>
> | | 脚本头的元数据 | Greasy Fork 的「描述」文本框 |
> | --- | --- | --- |
> | 长什么样 | `// @description:zh-CN  一句话` | 网页上那个大文本域 |
> | **能否换行** | ❌ **必须单行** | ✅ 可以多行 |
> | 上限 | 500 字符 | 同一份数据，也是 500 字符 |
>
> **踩过的坑**：在 Greasy Fork 网页编辑器里把**多行说明**写进了**元数据行**。
> 换行后第二行没有 `//` 前缀，就被当成 JavaScript 代码，报
> `Uncaught SyntaxError: Unexpected identifier 'Eagle'`（`Eagle` 正是断行后那行的开头）。
>
> **正确做法**：
> - **元数据**只放**一句短的**（单行）
> - **多行说明**粘到 Greasy Fork 的「描述」文本框里
>
> 另外两条也来自 Greasy Fork 源码 `app/models/script.rb`
> （`MAX_LENGTHS = { name: 100, description: 500 }`，超长**静默截断**不报错）：
> **描述框不渲染 Markdown**（`[文字](链接)` 会原样显示），要给网址就直接写完整 URL。

---

## 脚本名

`@name` 用英文名，Greasy Fork 会按浏览器语言自动切到 `@name:zh-CN`：

```text
Save Twitter/X Media to Eagle
```

中文用户看到的标题是 **Twitter/X 媒体收藏到 Eagle**。

---

## 元数据：`@description` 只写一句（必须单行）

### 中文（推荐，69 字符）

```text
在推文操作栏加 Eagle 按钮，一键把原视频/原图存进 Eagle；可视化设置面板、自定义文件名与序号、可选分类面板、可跳转 Eagle
```

### 英文（218 字符）

```text
Add an Eagle button to the tweet action bar: one click saves the original video/images into Eagle. Visual settings panel, custom filename template with sequence numbers, optional categorize dialog, jump-to-Eagle links.
```

> 这行是写在 `// @description:zh-CN  ` 后面的。
> **不要在这里换行**，也不要写 Markdown。
> 想加更多内容，放到下面的「描述文本框」里。

---

## 描述文本框：多行版（410 字符，在 500 上限内）

这段粘到 Greasy Fork 的「描述」框。**可以换行**，但不要写 Markdown，网址直接写完整 URL。

```text
把 X/Twitter 的原视频、原图一键存进 Eagle，不用先下载再导入。

本脚本是 Eagle-media-collector 项目的一部分：
https://github.com/Frostleaf0929/Eagle-media-collector

功能：一键收藏原视频（取最高码率的 mp4）与原图；可视化设置面板，可自定义文件名与模板占位符；多文件自动加序号；可选分类面板（文件夹/标签/注释）；已收藏过的会变绿；保存后可跳转到 Eagle 对应条目。

前提：Eagle 必须在运行（脚本走它的本地 Web API）。需要 Tampermonkey 或同类管理器。

支持 X / Twitter 及 fixupx、fxtwitter、vxtwitter 镜像站。

已知限制：视频需先播放过一次才能拿到文件地址；引用推文里的媒体默认不收藏（可在设置里打开）。

完整说明、更新日志与扩展补丁见仓库。
```

用 `node docs/check-greasy-fork-description.js` 可以随时核对长度。

---

## 为什么不能再长

Greasy Fork 的校验（`app/models/script.rb`）：

```ruby
MAX_LENGTHS = { name: 100, description: 500, additional_info: 50_000 }.freeze
```

导入路径会开 `truncate_description = true`，所以超长不是报错，而是**悄悄砍掉第 500 字符之后的内容**。
排查时就是从「描述末尾莫名断在半句话」反推到这个限制的。

**想让描述更丰富**：Greasy Fork 的脚本页另有「附加信息」字段，上限 50,000 字符，
且**支持 HTML/Markdown**。详细功能列表适合放那里，而不是塞进脚本的 `@description`。

---

## 备查：完整功能列表（放仓库或「附加信息」用）

### 纯文本

```text
功能：
- 一键收藏原视频：从 X 的接口数据里取出最高码率的 mp4，不是页面上播放的那个片段
- 一键收藏原图：把缩略图地址改写成 name=orig 拿原图
- 一条推文里的视频和图片会一起收藏
- 自定义文件名：可视化设置面板，支持 7 个占位符（{user-name} 显示名、{user-id} 用户名、{status-id} 推文 ID、{date-time} 推文时间、{full-text} 推文正文、{file-name} 原文件名、{file-type} 扩展名）
- 多个文件自动加序号：名字-01、名字-02，不会互相覆盖
- 可选分类面板：保存前选文件夹、加标签、写注释
- 已收藏过的会变绿色，避免重复收藏
- 保存成功后可直接跳转到 Eagle 对应条目

用法：
1. 打开一条带视频或图片的推文
2. 如果是视频，先点一下播放（这样才拿得到视频文件地址）
3. 点推文下方操作栏里那个蓝色 Eagle 图标（旁边的齿轮按钮是设置）

需要的前提：
- Eagle 必须在运行。脚本通过 Eagle 的本地 Web API（http://localhost:41595）把任务交给 Eagle
- 需要 Tampermonkey 或同类的用户脚本管理器

支持范围：X / Twitter，以及 fixupx、fxtwitter、vxtwitter 这类镜像站。

已知限制：
- 视频需要先播放过一次才能拿到文件地址（X 用的是 MSE 流，地址出现在网络层）
- 引用推文里的媒体默认不收藏（设置面板里可以打开）
- HLS / m3u8 分片流会被跳过，避免存进坏文件

如果你之前从本地文件装过早期版本，它的 @namespace 是 https://eagle.cool/、@name 是「Eagle 媒体收藏（X / Twitter）」。代码和现在这份完全相同，但 Tampermonkey 靠 @name + @namespace 认脚本，两者都不一样，所以它会被当成另一个脚本。请在 Tampermonkey 里删掉旧的那份，只保留从本页安装的这份，否则推文下面会出现两个 Eagle 按钮、两套各自独立的设置。

开发说明：本项目主要由 DSH（DeepSeek Harness）编写。用户脚本的需求分析、逆向 X 的网络数据格式、设置面板与全部测试均由 DSH 编写；需求、验证与实机测试由项目作者 Frostleaf0929 提出与执行。

许可：MIT

相关链接：
项目主页与问题反馈：https://github.com/Frostleaf0929/Eagle-media-collector
另含一个浏览器扩展补丁：给 Eagle 官方扩展加「拖拽时获取原图」开关
```

### Markdown

（用于 README、GitHub 等支持 Markdown 的地方，**不要**粘进 Greasy Fork 的描述框）

````markdown
把 X/Twitter 的**原视频、原图**一键存进 [Eagle](https://eagle.cool/)，不用先下载再导入。

本脚本是 [Eagle-media-collector](https://github.com/Frostleaf0929/Eagle-media-collector) 项目的一部分。

## 功能

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

## 用法

1. 打开一条带视频或图片的推文
2. **如果是视频，先点一下播放**（这样才拿得到视频文件地址）
3. 点推文下方操作栏里那个**蓝色 Eagle 图标**

   旁边的**齿轮**按钮是设置（媒体类型、文件名格式、分类面板等）。
   Tampermonkey 菜单里也有入口：「⚙ Eagle 收藏设置」、「🔍 诊断」。

## 需要的前提

- **Eagle 必须在运行**。脚本通过 Eagle 的本地 Web API（`http://localhost:41595`）把任务交给 Eagle。
- 需要 Tampermonkey 或同类的用户脚本管理器。

## 支持范围

X / Twitter，以及 fixupx、fxtwitter、vxtwitter 这类镜像站。

## 已知限制

- **视频需要先播放过一次**才能拿到文件地址（X 用的是 MSE 流，地址出现在网络层）
- 引用推文里的媒体默认**不收藏**（设置面板里可以打开）
- HLS / m3u8 分片流会被跳过，避免存进坏文件

## 如果是从本地文件装过旧版

本脚本早期有一个**只在本地存在**的版本，它的 `@namespace` 是 `https://eagle.cool/`、
`@name` 是「Eagle 媒体收藏（X / Twitter）」。

代码和现在这份**完全相同**，但 Tampermonkey 靠 `@name` + `@namespace` 认脚本，
两者都不一样，所以它会被当成**另一个脚本**。

如果你之前装过那份，请在 Tampermonkey 里把它删掉，只保留从本页安装的这份，
否则推文下面会出现两个 Eagle 按钮、两套各自独立的设置。

## 开发说明

本项目**主要由 DSH（DeepSeek Harness）编写**。

- 用户脚本：从需求分析、逆向 X 的网络数据格式，到设置面板与全部测试，均由 DSH 编写
- 扩展补丁（`patches/`）：补丁逻辑与锚点定位均由 DSH 编写
- 需求、验证与实机测试由项目作者（Frostleaf0929）提出与执行

## 许可

MIT

## 相关

- 项目主页 / 问题反馈：<https://github.com/Frostleaf0929/Eagle-media-collector>
- 另含一个浏览器扩展补丁：给 Eagle 官方扩展加「拖拽时获取原图」开关
````
