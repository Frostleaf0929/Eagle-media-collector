# Greasy Fork 脚本页：可直接粘贴的文案

> ## 字段真相（实测 + 源码确认，别再看错）
>
> Greasy Fork 有**新建**和**更新**两套表单，字段不一样
> （源码 `app/views/script_versions/_form.html.erb`）：
>
> | 表单 | 字段顺序 | 有 description 输入框吗 |
> | --- | --- | --- |
> | **新建脚本** | `name` → `description` → `code` → `additional_info` → 截图 | **有** |
> | **更新脚本** | `name` → `code` → `additional_info` → 截图 → 更新说明 | **没有** |
>
> **更新时 `description` 是从代码里的 `@description` 解析出来的**，只能在网页上编辑代码元数据来改它。
> 所以**更新脚本时，能写多行内容的框只有「附加信息」那一个**。
>
> | 放什么 | 写到哪 | 换行 | 上限 | Markdown |
> | --- | --- | --- | --- | --- |
> | 一句话简介 | 代码元数据 `// @description:xx` | ❌ **必须单行** | 500 | ❌ |
> | 详细说明 | **更新表单的「附加信息」框** | ✅ 多行 | **50,000** | ✅ 支持 |
>
> 中文界面上「附加信息」框的提示语就是：「**更详细的描述，或者操作说明等。**」
>
> **踩过的坑**：把**多行说明写进了元数据行**。换行后第二行没有 `//` 前缀，
> 被当成 JavaScript 代码，报
> `Uncaught SyntaxError: Unexpected identifier 'Eagle'`（`Eagle` 是断行后那行的开头）。
>
> ⚠️ **「附加信息」有联动校验**：填了某语言的附加信息，就必须存在同语言的
> `@name:xx`，否则报「您提交了该语言的附加信息，但没有指定 `@name:xx`」
> （源码 `script_version.rb` 的 `localized_additional_info_with_no_name`）。
> 本项目已有 `@name:zh-CN`，所以填中文附加信息是安全的。

---

## 脚本名

`@name` 用英文名，Greasy Fork 会按浏览器语言自动切到 `@name:zh-CN`：

```text
Save Twitter/X Media to Eagle
```

中文用户看到的标题是 **Twitter/X 媒体收藏到 Eagle**。

---

## 代码元数据：`@description` 只写一句（必须单行）

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
> 想加更多内容，放到下面的「附加信息」里。

---

## 附加信息：多行版（410 字符，远低于 50,000 上限）

这段粘到**更新表单里的「附加信息」框**（就是中文提示语写着
「更详细的描述，或者操作说明等。」的那个）。**可以换行**。

这个框在页面上**支持 Markdown**，但为稳妥、也便于直接阅读，这里给的是纯文本版；
想要 Markdown 排版，用本文件末尾「备查」区那份。

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

## 附加信息：想写更长、想用 Markdown 就放这里

「附加信息」上限 **50,000 字符**，且**支持 HTML / Markdown**，
在脚本页上会显示成一个独立区块。

- ✅ 可以多行、可以 Markdown、可以放截图
- ⚠️ 填了某语言的附加信息，就必须有同语言的 `@name:xx`（本项目已有 `@name:zh-CN`，安全）
- ℹ️ 中文页面上的提示语是「**更详细的描述，或者操作说明等。**」
- ℹ️ 完整的 Markdown 版功能列表见本文件末尾「备查」区，可直接粘过去

---

## 为什么 `@description` 不能再长

Greasy Fork 的校验（`app/models/script.rb`）：

```ruby
MAX_LENGTHS = { name: 100, description: 500, additional_info: 50_000 }.freeze
```

导入路径会开 `truncate_description = true`，所以超过 500 字符不是报错，
而是**悄悄砍掉第 500 字符之后的内容**。排查时就是从「描述末尾莫名断在半句话」反推到这个限制的。

**想让描述更丰富**：放上面那个「附加信息」框（上限 50,000 字符），
而不是往 `@description` 或描述里塞。

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

（用于 README、GitHub 等支持 Markdown 的地方；也可以粘进 Greasy Fork 的「附加信息」框）

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
