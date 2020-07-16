/* eslint-env serviceworker */

var version = '1.0.0'
var cacheName = 'www.delasy.com-v' + version

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(cacheName).then(function (cache) {
      return cache.addAll(['/', '/index.html', '/_offline.html'])
    })
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keyList) {
      return Promise.all(
        keyList
          .filter(function (key) {
            return key !== cacheName
          })
          .map(function (key) {
            return caches.delete(key)
          })
      )
    })
  )
})

self.addEventListener('fetch', function (event) {
  var isSameOrigin = new URL(event.request.url).origin === '{{ PUBLIC_URL }}'

  event.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(event.request)
        .then(function (response) {
          return response || fetch(event.request).then(function (response) {
            if (!isSameOrigin) {
              return response
            }

            return cache.put(event.request, response.clone()).then(function () {
              return response
            })
          })
        })
        .catch(function (err) {
          if (isSameOrigin) {
            return cache.match('/_offline.html')
          } else {
            throw err
          }
        })
    })
  )
})
