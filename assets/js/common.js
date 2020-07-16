(function (document) {
  function mapElementsByClass (classNames, callback) {
    if (typeof classNames === 'string') {
      classNames = [classNames]
    }

    for (var i = 0; i < classNames.length; i++) {
      var elements = document.getElementsByClassName(classNames[i])

      for (var j = 0; j < elements.length; j++) {
        callback(elements[j], j)
      }
    }
  }

  mapElementsByClass('default-layout__header-toggler', function (element) {
    element.addEventListener('click', function () {
      mapElementsByClass('default-layout__header-menu', function (element) {
        element.style.left = '0'
      })

      mapElementsByClass('default-layout__header-overlay', function (element) {
        element.style.display = 'block'
      })
    })
  })

  mapElementsByClass(['default-layout__header-close', 'default-layout__header-overlay'], function (element) {
    element.addEventListener('click', function () {
      mapElementsByClass('default-layout__header-menu', function (element) {
        element.style.left = ''
      })

      mapElementsByClass('default-layout__header-overlay', function (element) {
        element.style.display = ''
      })
    })
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('{{ PUBLIC_URL }}/sw.js')
  }
})(document)
