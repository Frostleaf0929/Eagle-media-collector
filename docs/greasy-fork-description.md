# Greasy Fork 脚本页：可直接粘贴的文案

发布时把下面「脚本名」和「描述」两部分分别粘到 Greasy Fork 对应的输入框里。

GitHub 不支持在描述里内嵌图片，但 Greasy Fork 支持 Markdown，链接可以正常显示。

---

## 脚本名

`@name` 用英文名，Greasy Fork 会按浏览器语言自动切到 `@name:zh-CN`：

```text
Save Twitter/X Media to Eagle
```

所以中文用户看到的标题会是 **Twitter/X 媒体收藏到 Eagle**。

## 描述

````markdown
把 X/Twitter 的**原视频、原图**一键存进 [Eagle](https://eagle.cool/)，不用先下载再导入。

本脚本是 [Eagle-media-collector](https://github.com/Frostleaf0929/Eagle-media-collector) 项目的一部分。
脚本文件名是 `save-twitter-media-to-eagle.user.js`，仓库名是本项目的名字，两者刻意不同名 ——
但脚本的 `@namespace` 就指向本仓库，这是它和本项目的关系凭据。

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
