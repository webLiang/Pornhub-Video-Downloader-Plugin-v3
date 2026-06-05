(function () {
  // Unified cache: vkey -> mediaDefinitions to avoid repeated requests; max entries to prevent unbounded memory growth
  var CACHE_MAX = 50;
  var cache = (window.__PH_SHORTIES_CACHE__ = window.__PH_SHORTIES_CACHE__ || { map: {}, keys: [] });

  function setShortiesCache(vkey, mediaDefinitions) {
    if (!vkey || !mediaDefinitions) return;
    if (cache.map[vkey]) return;
    while (cache.keys.length >= CACHE_MAX) {
      var old = cache.keys.shift();
      delete cache.map[old];
    }
    cache.map[vkey] = mediaDefinitions;
    cache.keys.push(vkey);
  }

  function getShortiesCache(vkey) {
    return cache.map[vkey] || null;
  }

  function postMediaDefinitions(mediaDefinitions, flashvarsData) {
    if (!mediaDefinitions) return;
    window.postMessage({
      type: 'get-ph-flashvars',
      data: mediaDefinitions,
      video_title: flashvarsData && flashvarsData.video_title,
    });
  }

  function getShortiesVkeyFromUrl(url) {
    if (!url) return '';
    var m = url.match(/\/shorties\/([^/?#]+)\/?$/);
    if (!m) return '';
    return m[1] || '';
  }

  function getJsonShortiesArray() {
    var raw = window.JSON_SHORTIES;
    if (!raw) return null;

    if (Array.isArray(raw)) return raw;

    // Some pages inject JSON_SHORTIES as a string
    if (typeof raw === 'string') {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /** Find the current video item in list by vkey or linkUrl/shortieUrl */
  function findItemByVkey(list, vkey) {
    if (!list || !list.length || !vkey) return null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && it.vkey === vkey) return it;
    }
    for (var j = 0; j < list.length; j++) {
      var it2 = list[j];
      if (!it2) continue;
      var linkUrl = it2.linkUrl || '';
      var shortieUrl = it2.shortieUrl || '';
      if (String(linkUrl).indexOf(vkey) >= 0 || String(shortieUrl).indexOf(vkey) >= 0) return it2;
    }
    return null;
  }

  /**
   * Extract JSON_SHORTIES array from shorties page HTML via bracket matching.
   * Page format: JSON_SHORTIES = insertAfterNthPosition([{...},{...}], prerollObject, AD_POSITION),
   */
  function extractJsonShortiesArrayFromHtml(html) {
    var needle = 'JSON_SHORTIES = insertAfterNthPosition([';
    var startIdx = html.indexOf(needle);
    if (startIdx === -1) return null;
    var bracketStart = startIdx + needle.length - 1; // points to '['
    var depth = 1;
    var inString = false;
    var escape = false;
    for (var i = bracketStart + 1; i < html.length; i++) {
      var c = html[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (c === '\\') {
          escape = true;
          continue;
        }
        if (c === '"') {
          inString = false;
          continue;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          var jsonStr = html.substring(bracketStart, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  // 1) Shorties page: check cache first, then window.JSON_SHORTIES; if missing, fetch current href and extract from HTML
  var vkey = getShortiesVkeyFromUrl(window.location && window.location.href);
  if (vkey) {
    var cached = getShortiesCache(vkey);
    if (cached) {
      postMediaDefinitions(cached);
      return;
    }

    var list = getJsonShortiesArray();
    var item = list ? findItemByVkey(list, vkey) : null;

    if (item && item.mediaDefinitions) {
      setShortiesCache(vkey, item.mediaDefinitions);
      postMediaDefinitions(item.mediaDefinitions, item);
      return;
    }

    // vkey not in JSON_SHORTIES or list empty: fetch current page HTML and extract JSON_SHORTIES
    var currentHref = window.location.href;
    fetch(currentHref, { credentials: 'same-origin' })
      .then(function (res) {
        return res.text();
      })
      .then(function (html) {
        var fetchedList = extractJsonShortiesArrayFromHtml(html);
        var fetchedItem = fetchedList ? findItemByVkey(fetchedList, vkey) : null;
        if (fetchedItem && fetchedItem.mediaDefinitions) {
          setShortiesCache(vkey, fetchedItem.mediaDefinitions);
          postMediaDefinitions(fetchedItem.mediaDefinitions, fetchedItem);
        }
      })
      .catch(function () {});

    return;
  }

  // 2) Regular video page: use flashvars_XXXX.mediaDefinitions
  function getFlashvarsNameFromScripts() {
    var knownScript = (
      document.querySelector('#mobileContainer >script:nth-child(1)') ||
      document.querySelector('#player >script:nth-child(1)')
    )?.innerHTML;
    var knownMatch = knownScript && knownScript.match(/flashvars_[0-9]{1,}/);
    if (knownMatch && knownMatch[0]) return knownMatch[0];

    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var html = scripts[i].innerHTML || scripts[i].textContent || '';
      var match = html.match(/flashvars_[0-9]{1,}/);
      if (match && match[0]) return match[0];
    }

    return '';
  }

  function getFlashvarsNameFromWindow() {
    for (var prop in window) {
      if (/^flashvars_[0-9]{1,}$/.test(prop)) return prop;
    }
    return '';
  }

  var flashvars = getFlashvarsNameFromScripts() || getFlashvarsNameFromWindow();
  if (!flashvars) return;

  console.log('🚀 ~ handleMessage ~ flashvars:', flashvars);
  if (window[flashvars] && window[flashvars].mediaDefinitions) {
    postMediaDefinitions(window[flashvars].mediaDefinitions, window[flashvars]);
  }
})();
