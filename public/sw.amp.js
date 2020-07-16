importScripts('https://cdn.ampproject.org/sw/amp-sw.js')

AMP_SW.init({
  assetCachingOptions: [{
    regexp: /.*/,
    cachingStrategy: 'CACHE_FIRST'
  }],
  offlinePageOptions: {
    url: '/_offline.amp.html',
    assets: ['/index.amp.html']
  }
})
