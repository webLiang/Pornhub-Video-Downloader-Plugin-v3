# Pornhub Video Downloader — मल्टी-रेज़ोल्यूशन डाउनलोड

**भाषाएँ / Languages**

- **中文**：[README.zh_CN.md](README.zh_CN.md)
- **English**：[README.md](README.md)
- **Español**：[README.es.md](README.es.md)
- **हिन्दी**（वर्तमान）：[README.hi.md](README.hi.md)
- **العربية**：[README.ar.md](README.ar.md)

Chrome एक्सटेंशन जो Pornhub और अन्य समर्थित साइटों पर **मल्टी-रेज़ोल्यूशन** में वीडियो डाउनलोड करने देता है। यह रिपॉज़िटरी इसलिए मेंटेन की जा रही है क्योंकि [मूल प्रोजेक्ट](https://github.com/zgao264/Pornhub-Video-Downloader-Plugin) लंबे समय से अपडेट नहीं है और Manifest V2 डिप्रिकेट हो रहा है।

---

## 1. मल्टी-रेज़ोल्यूशन डाउनलोड + स्क्रीनशॉट

- समर्थित साइटों पर **कई क्वालिटी** (जैसे 720p, 1080p) चुनकर डाउनलोड कर सकते हैं।
- एक्सटेंशन वीडियो पेज में JS inject करके वास्तविक stream URL निकालता है और डाउनलोड लिंक बनाता है।

<p align="center">
  <img src="./images/ScreenShot_2026-01-30_115236_135.png" alt="एक्सटेंशन स्क्रीनशॉट" width="480" />
</p>

---

## 2. मोबाइल पर एक्सटेंशन सपोर्ट करने वाले ब्राउज़र (महत्वपूर्ण)

मोबाइल/टैबलेट पर उपयोग के लिए ऐसा ब्राउज़र चाहिए जो एक्सटेंशन इंस्टॉल करने दे। अनुशंसित:

| प्लेटफ़ॉर्म | अनुशंसा |
|-----------|---------|
| **मोबाइल** | **[Quetta](https://www.quetta.net/)** — Chrome एक्सटेंशन सपोर्ट और बिल्ट-इन वीडियो क्षमता |

> **मोबाइल URL (बुकमार्क करें):**  
> **https://www.quetta.net/**

<p align="center">
  <img src="./images/vC9a0X1ijXbch5Nqw4EvBAPjg.avif" alt="Quetta मोबाइल ब्राउज़र" width="360" />
</p>

---

## डाउनलोड और इंस्टॉल

- **ZIP डाउनलोड:** [Releases — Pornhub-Video-Downloader-Plugin.zip](https://github.com/webLiang/Pornhub-Video-Downloader-Plugin-v3/releases)

### Chrome

1. `chrome://extensions/` खोलें
2. **Developer mode** ऑन करें
3. **Load unpacked** पर क्लिक करें और एक्सट्रैक्ट किए हुए फ़ोल्डर को चुनें

<p align="center">
  <img src="./images/usage.png" alt="Chrome में एक्सटेंशन लोड" width="480" />
</p>

### अन्य Chromium ब्राउज़र (जैसे 360)

- **.crx** डाउनलोड करके ब्राउज़र में ड्रैग करके इंस्टॉल करें।

---

## समर्थित साइटें

| साइटें |
|------|
| pornhub.com |
| xvideos.com |
| xnxx.com · xnxx.es |
| xvv1deos.com |
| xhamster.com · xhamster42.desi · xhamster1.desi |
| redtube.com |

---

## डेवलपमेंट और योगदान

- टेम्पलेट: [chrome-extension-boilerplate-react-vite](https://github.com/webLiang/chrome-extension-boilerplate-react-vite)
- **Star** और **MR** का स्वागत है।

---

## अपडेट रिकॉर्ड

| वर्ज़न | नोट्स |
|------|------|
| v1.0.3 | xnxx.com सपोर्ट |
| v1.0.4 | xhamster.com सपोर्ट |
| v1.0.5 | xvideos/xnxx के लिए 1080p और m3u8, UI सुधार |
| v1.0.7 | अन्य साइटों पर popup error होने पर remote version गलत दिखने की समस्या ठीक |
| v1.0.8 | ऑटोमेटेड crx build |
| v1.0.9 | redtube.com सपोर्ट |
| v1.0.10 | मल्टी-डोमेन: xvv1deos.com, xnxx.es, xhamster42.desi, xhamster1.desi |
| v1.0.11 | डाउनलोड फ़ाइल नाम सुधार |
| v1.0.12 | PC साइट पर फ़ाइल नाम सुधार |
| v1.0.15 | xvideos.com नियम सुधार |
| todo | प्लान्ड सपोर्ट: [spankbang.com](https://spankbang.com/) |

---

## Star History

<a href="https://star-history.com/#webLiang/Pornhub-Video-Downloader-Plugin-v3&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=webLiang/Pornhub-Video-Downloader-Plugin-v3&type=Date" />
  </picture>
</a>

