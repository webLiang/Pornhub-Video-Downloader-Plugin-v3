(function () {
  window.postMessage({
    type: 'main-get-xv-info',
    data: [
      { videoUrl: window['html5player'].url_high, quality: 'high', format: 'mp4' },
      { videoUrl: window['html5player'].url_low, quality: 'low', format: 'mp4' },
    ],
    hls: { url: window['html5player'].url_hls, format: 'm3u8' },
  });
})();
