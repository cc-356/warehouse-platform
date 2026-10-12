// File shortcuts open the same shared database as the running platform.
// legacy=1 keeps the old browser-local view available for exporting old records.
(() => {
  'use strict';
  if (location.protocol !== 'file:' || new URLSearchParams(location.search).get('legacy') === '1') return;
  location.replace('http://127.0.0.1:8765/modules/suppliers/index.html' + location.hash);
})();
