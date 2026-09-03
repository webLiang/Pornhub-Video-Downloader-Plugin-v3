# Pornhub-Video-Downloader 视频多分辨率下载

**语言 / Languages**

- **中文**（当前）：[README.zh_CN.md](README.zh_CN.md)
- **English**：[README.md](README.md)
- **Español**：[README.es.md](README.es.md)
- **हिन्दी**：[README.hi.md](README.hi.md)
- **العربية**：[README.ar.md](README.ar.md)

Chrome 插件，支持 Pornhub 等站点视频**多分辨率下载**。因[原仓库](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin)长期未更新且 2024 Manifest V2 即将弃用，故维护此仓库。

<table width="100%">
  <tr>
    <td align="center">
      <br/>
      <strong>⚡️ 基于这套 Chrome 扩展模板构建</strong>
      <h1><a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite">Vite 8</a></h1>
      <p><strong>React + TypeScript · Manifest V3 · 打包更快</strong></p>
      <p>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="Vite 8" height="36" src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="React" height="36" src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="Manifest V3" height="36" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite/blob/main/README.zh_CN.md#%E4%B8%BA%E4%BB%80%E4%B9%88%E7%94%A8%E8%BF%99%E4%B8%AA%E6%A8%A1%E6%9D%BF"><img alt="Builds ~100-300ms" height="36" src="https://img.shields.io/badge/Builds-~100--300ms-22c55e?style=for-the-badge" /></a>
      </p>
      <p>
        本插件基于 <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><strong>chrome-extension-boilerplate-react-vite</strong></a> 开发。<br/>
        <strong>Vite 8 + Rolldown</strong> — 生产构建通常约 <strong>100–300ms</strong>。<br/>
        📖 <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite/blob/main/README.zh_CN.md#%E7%AE%80%E4%BB%8B">模板文档</a> ·
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite/blob/main/README.zh_CN.md#%E4%B8%BA%E4%BB%80%E4%B9%88%E7%94%A8%E8%BF%99%E4%B8%AA%E6%A8%A1%E6%9D%BF">速度说明</a> ·
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite/blob/main/README.zh_CN.md#%E6%88%AA%E5%9B%BE">效果截图</a> ·
        <a href="https://github.com/vitejs/awesome-vite">Awesome Vite</a>
      </p>
      <p>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="GitHub stars" src="https://img.shields.io/github/stars/webLiang/chrome-extension-boilerplate-react-vite?style=for-the-badge&logo=github" /></a>
      </p>
      <p>欢迎给模板点 <strong>Star</strong>，也欢迎 <strong>Merge Request</strong>。</p>
      <br/>
    </td>
  </tr>
</table>

---

## 1. 多分辨率下载 + 插件截图

- 支持在支持的站点上选择**多种清晰度**（如 720p、1080p 等）下载视频。
- 通过向视频页注入 JS 获取真实流地址并提取下载链接。

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="插件截图" width="320" />
</p>

---

## 2. 移动端可安装插件的浏览器（重点）

在手机/平板上如需使用本插件，请使用**支持安装扩展**的浏览器，推荐：

| 平台 | 推荐 |
|------|------|
| **移动端** | **[Quetta](https://www.quetta.net/)** — 支持安装 Chrome 扩展，内置视频能力 |

> **移动端访问地址（请收藏）：** **https://www.quetta.net/**  
> **PC 端视频下载插件：** **https://www.quetta.net/products/pcextension**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="Quetta 移动端浏览器" width="240" />
</p>

Quetta 同时提供一款官方的多平台视频下载插件，支持 **YouTube · Twitter/X · Facebook · Bilibili · 抖音 / TikTok · Instagram · Vimeo** 等主流站点，作为本插件在桌面端的补充使用。

<p align="center">
  <a href="https://www.quetta.net/products/pcextension">
    <img src="./images/VBO44eHR7bku11CTLJORKU6Ryo.webp" alt="Quetta Video Downloader" width="320" />
  </a>
</p>

---

## 下载与安装

- **下载 ZIP**：[Releases 下载 Pornhub-Video-Downloader-Plugin.zip](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases)

### Chrome / 谷歌浏览器

1. 地址栏打开：`chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压后的插件目录

<p align="center">
  <img src="./images/usage.png" alt="Chrome 加载扩展" width="480" />
</p>

### 其他 Chromium 内核浏览器（如 360、360 极速等）

- 下载 **.crx** 后拖入浏览器即可安装。

---

## 支持网站

| 站点 |
|------|
| pornhub.com |
| xvideos.com |
| xnxx.com · xnxx.es |
| xvv1deos.com |
| xhamster.com · xhamster42.desi · xhamster1.desi |
| redtube.com |
| missav.ws · missav.live · missav.com |
| 123av.com |

---

## 更新记录

| 版本 | 说明 |
|------|------|
| v1.0.3 | 支持 xnxx.com |
| v1.0.4 | 支持 xhamster.com |
| v1.0.5 | xvideos/xnxx 支持 1080p、m3u8，UI 优化 |
| v1.0.7 | 其他站点 pop 报错时不误显示远程版本号 |
| v1.0.8 | 自动化 crx 打包 |
| v1.0.9 | 支持 redtube.com |
| v1.0.10 | 同内容多域名：xvv1deos.com、xnxx.es、xhamster42.desi、xhamster1.desi |
| v1.0.11 | 下载文件名优化 |
| v1.0.12 | PC 站下载文件名优化 |
| v1.0.15 | 修复 xvideos.com 规则 |
| v1.0.18 | 修复 ph 支持下载|
| v1.2.0 | 支持 missav.ws / missav.live / 123av.com HLS 下载 |
| todo | [spankbang.com](https://spankbang.com/) 计划支持 |

---

## Star History

<a href="https://star-history.dera.page/#webLiang/Pornhub-Video-Downloader-Plugin-v3&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
    <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
  </picture>
</a>

---

## 更多 Chrome 扩展

同一作者的其他开源扩展：

| 扩展 | 说明 |
|------|------|
| [DevTools Unlock](https://github.com/webLiang/devtools-unlock) | 在屏蔽调试的站点上恢复可用的 DevTools。 |
| [Header Modify](https://github.com/webLiang/header-modify-extention) | 为当前站点改写请求头（含 iframe）。 |

