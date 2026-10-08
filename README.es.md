# Pornhub Video Downloader — Descarga en múltiples resoluciones

**Idiomas / Languages**

- **中文**：[README.zh_CN.md](README.zh_CN.md)
- **English**：[README.md](README.md)
- **Español**（actual）：[README.es.md](README.es.md)
- **हिन्दी**：[README.hi.md](README.hi.md)
- **العربية**：[README.ar.md](README.ar.md)

Extensión de Chrome para descargar videos en **múltiples resoluciones** desde Pornhub y otros sitios compatibles. Este repositorio se mantiene porque el [proyecto original](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin) no se actualiza y Manifest V2 se deprecará.

<h3 align="center">
  Construido con <a href="https://github.com/webLiang/chrome-extension-boilerplate-ai"><b>chrome-extension-boilerplate-ai</b></a>
</h3>

<p align="center">
  Este proyecto está construido a partir de esa plantilla — <b>Vite 8</b>, Manifest V3 y una estructura más plana, más fácil de editar con agentes de IA.<br/>
  El build de producción suele tardar ~100–300ms.
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

## 1. Descarga multi-resolución + captura

- En sitios compatibles, permite elegir **varias calidades** (por ejemplo 720p, 1080p) y descargar el video.
- La extensión inyecta JS en la página del video para obtener la URL real del stream y extraer el enlace de descarga.

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="Captura de la extensión" width="320" />
</p>

---

## 2. Navegadores móviles que permiten extensiones (Importante)

Para usar esta extensión en **móvil/tablet**, necesitas un navegador que permita instalar extensiones. Recomendado:

| Plataforma | Recomendación |
|-----------|----------------|
| **Móvil** | **[Quetta](https://www.quetta.net/)** — Soporta extensiones de Chrome y tiene funciones de video |

> **URL móvil (guárdala):** **https://www.quetta.net/**  
> **Extensión PC para descargar video:** **https://www.quetta.net/products/pcextension**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="Navegador móvil Quetta" width="240" />
</p>

Quetta también ofrece una extensión oficial multiplataforma para descargar video — compatible con **YouTube · Twitter/X · Facebook · Bilibili · TikTok · Instagram · Vimeo** y más, un complemento útil de este plugin en el escritorio.

<p align="center">
  <a href="https://www.quetta.net/products/pcextension">
    <img src="./images/VBO44eHR7bku11CTLJORKU6Ryo.webp" alt="Quetta Video Downloader" width="320" />
  </a>
</p>

---

## Descargar e instalar

- **Descargar ZIP:** [Releases — Pornhub-Video-Downloader-Plugin.zip](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases)

### Chrome

1. Abre `chrome://extensions/`
2. Activa **Modo desarrollador**
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta extraída

<p align="center">
  <img src="./images/usage.png" alt="Cargar extensión en Chrome" width="480" />
</p>

### Otros navegadores Chromium (p. ej. 360)

- Descarga el archivo **.crx** y arrástralo al navegador para instalar.

---

## Sitios compatibles

También se incluyen los subdominios de idioma de un host listado (por ejemplo `cn.pornhub.com`, `de.pornhub.com`, `fr.pornhub.com`, `es.pornhub.com`). La coincidencia usa el dominio registrable: las dos últimas etiquetas del hostname. Los dominios de país registrados por separado aparecen abajo.

| Sitio | Dominios |
|-------|----------|
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

## Registro de cambios

| Versión | Notas |
|--------|-------|
| v1.0.3 | Soporte para xnxx.com |
| v1.0.4 | Soporte para xhamster.com |
| v1.0.5 | 1080p y m3u8 para xvideos/xnxx, mejoras de UI |
| v1.0.7 | Corrige mostrar versión remota cuando el popup falla en otros sitios |
| v1.0.8 | Empaquetado crx automatizado |
| v1.0.9 | Soporte para redtube.com |
| v1.0.10 | Multi-dominio: xvv1deos.com, xnxx.es, xhamster42.desi, xhamster1.desi |
| v1.0.11 | Mejora del nombre de archivo descargado |
| v1.0.12 | Mejora del nombre de archivo en PC |
| v1.0.15 | Arregla reglas de xvideos.com |
| v1.2.0 | Descarga HLS en missav.ws / missav.live / 123av.com |
| todo | Soporte planificado: [spankbang.com](https://spankbang.com/) |

---

## Apoya este proyecto

**Si este plugin te ahorró tiempo, por favor da star a este repo** — es la forma más rápida de apoyar el mantenimiento y que más gente lo encuentre.

**[Star webLiang/Pornhub-Video-Downloader-Plugin-v3](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3)**

<div align="center">

<img src="./images/star-pornhub-video-downloader.gif" alt="Cómo dar Star a este repositorio en GitHub" width="760" />

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

## Más extensiones de Chrome

Otras herramientas de código abierto del mismo autor:

| Extensión | Descripción |
|-----------|-------------|
| [DevTools Unlock](https://github.com/webLiang/devtools-unlock) | Restaura DevTools en sitios que bloquean la depuración (p. ej. disable-devtool). |
| [Header Modify](https://github.com/webLiang/header-modify-extention) | Reescribe las cabeceras de petición del sitio actual, incluidos los iframes. |

