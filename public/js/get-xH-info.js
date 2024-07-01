(function () {
  const mp4Urls = window.initials.xplayerSettings.sources.standard.h264;
  console.log('🚀 ~ mp4Urls:', mp4Urls);
  window.postMessage({
    type: 'main-get-xh-info',
    data: mp4Urls.map(item => {
      return { videoUrl: item.url, quality: item.quality, format: 'mp4' };
    }),
  });
})();
