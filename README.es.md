# Pornhub Video Downloader — Descarga en múltiples resoluciones

**Idiomas / Languages**

- **中文**：[README.zh_CN.md](README.zh_CN.md)
- **English**：[README.md](README.md)
- **Español**（actual）：[README.es.md](README.es.md)
- **हिन्दी**：[README.hi.md](README.hi.md)
- **العربية**：[README.ar.md](README.ar.md)

Extensión de Chrome para descargar videos en **múltiples resoluciones** desde Pornhub y otros sitios compatibles. Este repositorio se mantiene porque el [proyecto original](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin) no se actualiza y Manifest V2 se deprecará.

---

## 1. Descarga multi-resolución + captura

- En sitios compatibles, permite elegir **varias calidades** (por ejemplo 720p, 1080p) y descargar el video.
- La extensión inyecta JS en la página del video para obtener la URL real del stream y extraer el enlace de descarga.

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="Captura de la extensión" width="480" />
</p>

---

## 2. Navegadores móviles que permiten extensiones (Importante)

Para usar esta extensión en **móvil/tablet**, necesitas un navegador que permita instalar extensiones. Recomendado:

| Plataforma | Recomendación |
|-----------|----------------|
| **Móvil** | **[Quetta](https://www.quetta.net/)** — Soporta extensiones de Chrome y tiene funciones de video |

> **URL móvil (guárdala):**  
> **https://www.quetta.net/**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="Navegador móvil Quetta" width="360" />
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

| Sitios |
|-------|
| pornhub.com |
| xvideos.com |
| xnxx.com · xnxx.es |
| xvv1deos.com |
| xhamster.com · xhamster42.desi · xhamster1.desi |
| redtube.com |

---

## Desarrollo y contribución

- Plantilla base: [chrome-extension-boilerplate-react-vite](https://github.com/webLiang/chrome-extension-boilerplate-react-vite)
- Se agradecen **Stars** y **Merge Requests**.

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
| todo | Soporte planificado: [spankbang.com](https://spankbang.com/) |

---

## Star History

<a href="https://star-history.com/#webLiang/Pornhub-Video-Downloader-Plugin-v3&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
  </picture>
</a>

