(function () {
  function getDeepValue(obj, path) {
    const keys = path.split('.');
    return keys.reduce((accumulator, key) => {
      if (accumulator === undefined || accumulator === null) {
        return undefined;
      }
      return accumulator[key];
    }, obj);
  }
  const datapathEl = document.querySelector('#main-inject-js');
  const dPath = datapathEl.getAttribute('data-path');
  const finalValue = getDeepValue(window, dPath);
  window.postMessage({
    type: 'main-window-data',
    data: finalValue,
  });
})();
