(function () {
  var jsString = (
    document.querySelector('#mobileContainer >script:nth-child(1)') ||
    document.querySelector('#player >script:nth-child(1)')
  )?.innerHTML;
  if (jsString) {
    var flashvars = jsString.match('flashvars_[0-9]{1,}')[0];
    console.log('🚀 ~ handleMessage ~ flashvars:', flashvars);
    window.postMessage({
      type: 'get-ph-flashvars',
      data: window[flashvars].mediaDefinitions,
    });
  }
})();
