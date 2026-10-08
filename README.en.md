# Pornhub Video Downloader — Multi-Resolution Download

**Languages**

- **中文**：[README.zh_CN.md](README.zh_CN.md)
- **English** (current)：[README.md](README.md)
- **Español**：[README.es.md](README.es.md)
- **हिन्दी**：[README.hi.md](README.hi.md)
- **العربية**：[README.ar.md](README.ar.md)

Chrome extension for **multi-resolution video download** on Pornhub and other supported sites. This repo is maintained because the [original project](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin) is unmaintained and Manifest V2 will be deprecated in 2024.

<h3 align="center">
  Built on <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><b>chrome-extension-boilerplate-ai</b></a>
</h3>

<p align="center">
  This project is built from that template — <b>Vite 8</b>, Manifest V3, and a flatter layout that is easier for AI coding agents to edit.<br/>
  Typical production build ~100–300ms.
</p>

<p align="center">
  <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat&logo=vite&logoColor=white" /></a>
  <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat&logo=googlechrome&logoColor=white" /></a>
  <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><img alt="AI-friendly" src="https://img.shields.io/badge/AI-friendly-111111?style=flat" /></a>
  <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai#intro">Docs</a>
  ·
  <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><img alt="GitHub stars" src="https://img.shields.io/github/stars/webLiang/chrome-extension-boilerplate-ai?style=flat" /></a>
</p>

---

## 1. Multi-Resolution Download & Screenshot

- Choose **multiple quality levels** (e.g. 720p, 1080p) and download videos on supported sites.
- The extension injects JS into video pages to obtain stream URLs and extract download links.

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="Extension screenshot" width="320" />
</p>

---

## 2. Mobile Browsers That Support Extensions (Important)

To use this extension on **phones or tablets**, you need a browser that supports installing extensions. Recommended:

| Platform | Recommendation |
|----------|----------------|
| **Mobile** | **[Quetta](https://www.quetta.net/)** — Supports Chrome extensions and built-in video |

> **Mobile URL (bookmark this):** **https://www.quetta.net/**  
> **PC video downloader extension:** **https://www.quetta.net/products/pcextension**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="Quetta mobile browser" width="240" />
</p>

Quetta also ships an official multi-platform video downloader extension — works on **YouTube · Twitter/X · Facebook · Bilibili · TikTok · Instagram · Vimeo** and more, a handy desktop complement to this plugin.

<p align="center">
  <a href="https://www.quetta.net/products/pcextension">
    <img src="./images/VBO44eHR7bku11CTLJORKU6Ryo.webp" alt="Quetta Video Downloader" width="320" />
  </a>
</p>

---

## Download & Install

- **Download ZIP:** [Releases — Pornhub-Video-Downloader-Plugin.zip](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases)

### Chrome

1. Open `chrome://extensions/` in the address bar.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the extracted extension folder.

<p align="center">
  <img src="./images/usage.png" alt="Chrome load extension" width="480" />
</p>

### Other Chromium-based Browsers (e.g. 360, 360 Extreme)

- Download the **.crx** file and drag it into the browser to install.

---

## Supported Sites

Language subdomains of a listed host are included (for example `cn.pornhub.com`, `de.pornhub.com`, `fr.pornhub.com`, `es.pornhub.com`). Matching uses the registrable domain: the last two hostname labels. Separate country domains that are registered on their own are listed below.

| Site | Domains |
|------|---------|
| Pornhub | pornhub.com · pornhub.org · pornhubpremium.com |
| Xvideos | xvideos.com · xvv1deos.com |
| XNXX | xnxx.com · xnxx.es |
| xHamster | xhamster.com · xhamster.desi · xhamster1.desi · xhamster42.desi · xhamster43.desi · xhamster44.desi |
| RedTube | redtube.com |
| MissAV | missav.com · missav.ws · missav.live |
| 123AV | 123av.com |
| Tangxin Vlog | tangxinvlog.app |
| Rou.video | rou.video |

---

## Changelog

| Version | Notes |
|---------|--------|
| v1.0.3 | xnxx.com support |
| v1.0.4 | xhamster.com support |
| v1.0.5 | 1080p & m3u8 for xvideos/xnxx, UI improvements |
| v1.0.7 | Fix remote version shown on pop error for other sites |
| v1.0.8 | Automated crx build |
| v1.0.9 | redtube.com support |
| v1.0.10 | Multi-domain: xvv1deos.com, xnxx.es, xhamster42.desi, xhamster1.desi |
| v1.0.11 | Download filename improvements |
| v1.0.12 | PC site download filename improvements |
| v1.0.15 | Fix xvideos.com rules |
| v1.0.17 xvideos 修复
| v1.2.0 | missav.ws / missav.live / 123av.com HLS download |
| todo | [spankbang.com](https://spankbang.com/) planned |

---

## Support this project

**If this plugin saved you time, please star this repo** — it is the fastest way to support maintenance and help others find it.

**[Star webLiang/Pornhub-Video-Downloader-Plugin-v3](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3)**

<div align="center">

<img src="./images/star-pornhub-video-downloader.gif" alt="How to star this repository on GitHub" width="760" />

</div>

## Star History

<a href="https://star-history.dera.page/#webLiang/Pornhub-Video-Downloader-Plugin-v3&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
    <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
  </picture>
</a>

---

## More Chrome extensions

Other open-source tools from the same author:

| Extension | Description |
|-----------|-------------|
| [DevTools Unlock](https://github.com/webLiang/devtools-unlock) | Restore DevTools on sites that block debugging (e.g. disable-devtool). |
| [Header Modify](https://github.com/webLiang/header-modify-extention) | Rewrite request headers for the current site, including iframes. |
