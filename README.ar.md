# Pornhub Video Downloader — تنزيل متعدد الدقة

**اللغات / Languages**

- **中文**：[README.zh_CN.md](README.zh_CN.md)
- **English**：[README.md](README.md)
- **Español**：[README.es.md](README.es.md)
- **हिन्दी**：[README.hi.md](README.hi.md)
- **العربية**（الحالي）：[README.ar.md](README.ar.md)

إضافة Chrome لتنزيل مقاطع الفيديو بدقات متعددة من Pornhub ومواقع أخرى مدعومة. تتم صيانة هذا المستودع لأن [المشروع الأصلي](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin) غير مُحدَّث وManifest V2 قيد الإيقاف.

<table width="100%">
  <tr>
    <td align="center">
      <br/>
      <strong>⚡️ مبني باستخدام قالب إضافات Chrome هذا</strong>
      <h1><a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite">Vite 8</a></h1>
      <p><strong>React + TypeScript · Manifest V3 · بناء أسرع</strong></p>
      <p>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="Vite 8" height="36" src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="React" height="36" src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="Manifest V3" height="36" src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" /></a>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite#why-this-template"><img alt="Builds ~100-300ms" height="36" src="https://img.shields.io/badge/Builds-~100--300ms-22c55e?style=for-the-badge" /></a>
      </p>
      <p>
        طُوِّرت هذه الإضافة فوق <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><strong>chrome-extension-boilerplate-react-vite</strong></a>.<br/>
        <strong>Vite 8 + Rolldown</strong> — تكتمل بنى الإنتاج عادةً خلال <strong>~100–300ms</strong>.<br/>
        📖 <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite#intro">وثائق القالب</a> ·
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite#why-this-template">ملاحظات السرعة</a> ·
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite#screenshots">لقطات الشاشة</a> ·
        <a href="https://github.com/vitejs/awesome-vite">Awesome Vite</a>
      </p>
      <p>
        <a href="https://github.com/webLiang/chrome-extension-boilerplate-react-vite"><img alt="GitHub stars" src="https://img.shields.io/github/stars/webLiang/chrome-extension-boilerplate-react-vite?style=for-the-badge&logo=github" /></a>
      </p>
      <p>نرحّب بـ <strong>Stars</strong> و <strong>Merge Requests</strong> على القالب.</p>
      <br/>
    </td>
  </tr>
</table>

---

## 1. تنزيل متعدد الدقة + لقطة شاشة

- على المواقع المدعومة يمكنك اختيار **عدة مستويات جودة** (مثل 720p و1080p) وتنزيل الفيديو.
- تقوم الإضافة بحقن JS داخل صفحة الفيديو لاستخراج رابط البث الحقيقي وتوليد رابط التنزيل.

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="لقطة شاشة للإضافة" width="320" />
</p>

---

## 2. متصفحات جوّال تدعم الإضافات (مهم)

لاستخدام الإضافة على الهاتف/الجهاز اللوحي، تحتاج إلى متصفح يدعم تثبيت الإضافات. الموصى به:

| المنصة | التوصية |
|------|---------|
| **الجوال** | **[Quetta](https://www.quetta.net/)** — يدعم إضافات Chrome ويحتوي على ميزات فيديو مدمجة |

> **رابط الجوال (احفظه):** **https://www.quetta.net/**  
> **إضافة تنزيل الفيديو على الكمبيوتر:** **https://www.quetta.net/products/pcextension**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="متصفح Quetta للجوال" width="240" />
</p>

تقدّم Quetta أيضًا إضافة رسمية لتنزيل الفيديو متعددة المنصات — تعمل على **YouTube · Twitter/X · Facebook · Bilibili · TikTok · Instagram · Vimeo** والمزيد، وهي رفيق عملي لهذه الإضافة على سطح المكتب.

<p align="center">
  <a href="https://www.quetta.net/products/pcextension">
    <img src="./images/VBO44eHR7bku11CTLJORKU6Ryo.webp" alt="Quetta Video Downloader" width="320" />
  </a>
</p>

---

## التحميل والتثبيت

- **تحميل ZIP:** [Releases — Pornhub-Video-Downloader-Plugin.zip](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases)

### Chrome

1. افتح `chrome://extensions/`
2. فعّل **وضع المطوّر**
3. اضغط **Load unpacked** واختر مجلد الإضافة بعد فك الضغط

<p align="center">
  <img src="./images/usage.png" alt="تحميل الإضافة في Chrome" width="480" />
</p>

### متصفحات Chromium الأخرى

- حمّل ملف **.crx** ثم اسحبه إلى المتصفح لتثبيته.

---

## المواقع المدعومة

| المواقع |
|--------|
| pornhub.com |
| xvideos.com |
| xnxx.com · xnxx.es |
| xvv1deos.com |
| xhamster.com · xhamster42.desi · xhamster1.desi |
| redtube.com |
| missav.ws · missav.live · missav.com |
| 123av.com |

---

## سجل التحديثات

| الإصدار | الملاحظات |
|--------|-----------|
| v1.0.3 | دعم xnxx.com |
| v1.0.4 | دعم xhamster.com |
| v1.0.5 | دعم 1080p و m3u8 لـ xvideos/xnxx وتحسين الواجهة |
| v1.0.7 | إصلاح عرض النسخة البعيدة بشكل خاطئ عند خطأ popup في مواقع أخرى |
| v1.0.8 | بناء crx تلقائي |
| v1.0.9 | دعم redtube.com |
| v1.0.10 | دعم تعدد النطاقات: xvv1deos.com، xnxx.es، xhamster42.desi، xhamster1.desi |
| v1.0.11 | تحسين اسم ملف التنزيل |
| v1.0.12 | تحسين اسم ملف التنزيل على الكمبيوتر |
| v1.0.15 | إصلاح قواعد xvideos.com |
| v1.2.0 | دعم تنزيل HLS على missav.ws / missav.live / 123av.com |
| todo | دعم مخطط له: [spankbang.com](https://spankbang.com/) |

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

## المزيد من إضافات Chrome

أدوات مفتوحة المصدر أخرى من نفس المؤلف:

| الإضافة | الوصف |
|---------|-------|
| [DevTools Unlock](https://github.com/webLiang/devtools-unlock) | استعادة أدوات المطوّر على المواقع التي تمنع التصحيح (مثل disable-devtool). |
| [Header Modify](https://github.com/webLiang/header-modify-extention) | تعديل ترويسات الطلب للموقع الحالي، بما في ذلك الإطارات المضمّنة (iframes). |

