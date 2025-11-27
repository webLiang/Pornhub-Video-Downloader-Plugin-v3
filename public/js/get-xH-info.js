(function () {
  // const mp4Urls = window.initials.xplayerSettings.sources.standard.h264;
  const hlsUrl = window.xplayer.core.sourceController.chromecastSource;
  window.postMessage({
    type: 'main-get-xh-info',
    // data: hlsUrl,
    hls: { url: hlsUrl, format: 'm3u8' },
  });
})();
