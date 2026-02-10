(function () {
  window.postMessage({
    type: 'main-get-xv-info',
    data: [
      { videoUrl: window['html5player'].sUrlHigh, quality: 'high', format: 'mp4' },
      { videoUrl: window['html5player'].sUrlLow, quality: 'low', format: 'mp4' },
    ],
    hls: { url: window['html5player'].sUrlHls, format: 'm3u8' },
  });
})();
