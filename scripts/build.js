const CleanCSS = require('clean-css')
const HTMLMinifier = require('html-minifier')
const UglifyJS = require('uglify-js')
const fs = require('fs')
const path = require('path')
const { parsed: envVars } = require('dotenv').config()

const configs = require('../config.json')

const BUILD_TYPE_AMP = 'AMP'
const BUILD_TYPE_HTML = 'HTML'
const TIMESTAMP = Date.now()

const minifyCSS = (code, extraVars = {}) => {
  return new CleanCSS().minify(replaceEnvVars(code, extraVars)).styles || ''
}

const minifyHTML = (code, extraVars = {}) => {
  return HTMLMinifier.minify(replaceEnvVars(code, extraVars), {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: true,
    quoteCharacter: '"',
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true
  })
}

const minifyJS = (code, extraVars = {}) => {
  return UglifyJS.minify(replaceEnvVars(code, extraVars)).code || ''
}

const minifyJSON = (code, extraVars = {}) => {
  return JSON.stringify(JSON.parse(replaceEnvVars(code, extraVars)))
}

const minifyXML = (code, extraVars = {}) => {
  let minifiedCode = HTMLMinifier.minify(replaceEnvVars(code, extraVars), {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    quoteCharacter: '"',
    removeComments: true,
    removeRedundantAttributes: true,
    sortAttributes: true,
    sortClassName: true
  })

  minifiedCode = minifiedCode.replace(/\?> </g, '?><')
  return minifiedCode
}

const preprocess = (code, varKeys, varValues) => {
  const buildType = varValues[varKeys.indexOf('BUILD_TYPE')]
  const filename = varValues[varKeys.indexOf('FILENAME')]
  const publicUrl = varValues[varKeys.indexOf('PUBLIC_URL')]
  let newCode = ''
  let i = 0

  varKeys.push('link')

  varValues.push((path) => {
    return publicUrl + path + (buildType === BUILD_TYPE_AMP ? (path === '/' ? 'index' : '') + '.amp.html' : (path === '/' ? '' : '.html'))
  })

  while (true) {
    const startpos = code.indexOf('{{ ', i)

    if (startpos === -1) {
      newCode += code.substring(i)
      break
    } else {
      let endpos = code.indexOf(' }}', startpos + 3)

      if (endpos === -1) {
        throw new Error('Closing brackets not found for starting bracket at ' + startpos)
      }

      endpos += 3
      newCode += code.substring(i, startpos)

      const stmt = code.substring(startpos, endpos).substring(3).slice(0, -3)

      if (stmt.substring(0, 3) === 'if ') {
        let endifpos = code.indexOf('{{ endif }}', endpos)

        if (endifpos === -1) {
          throw new Error('endif not found for if statement at ' + filename + ':' + startpos)
        }

        endifpos += 11

        let ifval = code.substring(endpos, endifpos).slice(0, -11)
        let elseval = ''
        const elsepos = ifval.indexOf('{{ else }}')

        if (elsepos !== -1) {
          const tmp = ifval.split('{{ else }}')

          ifval = tmp[0]
          elseval = tmp[1]
        }

        const cond = stmt.substring(3)

        const execbody =
          'if (' + cond + ') {' +
          'return `' + ifval.replace(/`/g, '\\`') + '`;' +
          '} else {' +
          'return `' + elseval.replace(/`/g, '\\`') + '`;' +
          '}'

        // eslint-disable-next-line no-new-func
        const exec = new Function(...varKeys, execbody)

        newCode += exec.apply(null, varValues)
        i = endifpos
      } else if (stmt.includes('(') || stmt.includes(')')) {
        // eslint-disable-next-line no-new-func
        const exec = new Function(...varKeys, `return ${stmt};`)

        newCode += exec.apply(null, varValues)
        i = endpos
      } else {
        newCode += '{{ '
        i = startpos + 3
      }
    }
  }

  return newCode
}

const resolvePath = (pathname) => {
  const end = pathname.substr(-1) === '/' ? '/' : ''
  return path.resolve(__dirname, '..', pathname.substr(2)) + end
}

const replaceEnvVars = (str, extraVars) => {
  const vars = { ...extraVars }

  for (const varCopyKey of Object.keys(vars)) {
    const regex = new RegExp('{{ ' + varCopyKey + ' }}', 'g')
    str = str.replace(regex, vars[varCopyKey])
  }

  vars.PUBLIC_URL = envVars.PUBLIC_URL
  vars.TIMESTAMP = TIMESTAMP

  for (const varCopyKey of ['PUBLIC_URL', 'TIMESTAMP']) {
    const regex = new RegExp('{{ ' + varCopyKey + ' }}', 'g')
    str = str.replace(regex, vars[varCopyKey])
  }

  for (const iconName of Object.keys(icons)) {
    const regex = new RegExp('{{ ICON_' + iconName.toUpperCase().replace(/-/g, '_') + ' }}', 'g')
    str = str.replace(regex, icons[iconName])
  }

  const varKeys = Object.keys(vars).sort()
  const varValues = []

  for (const varKey of varKeys) {
    varValues.push(vars[varKey])
  }

  return preprocess(str, varKeys, varValues)
}

const iconNames = fs.readdirSync(resolvePath('~/assets/icons/')).map((icon) => {
  return icon.slice(0, -4)
})

const icons = {}

for (const iconName of iconNames) {
  icons[iconName] = fs.readFileSync(resolvePath('~/assets/icons/' + iconName + '.svg'), 'utf8')
}

const process = (config, name, buildType) => {
  const filename = name + (buildType === BUILD_TYPE_AMP ? '.amp' : '') + '.html'
  const isAlbum = config.page.layout === '~/layouts/album.html'

  const extraVars = {
    BUILD_TYPE: buildType,
    BUILD_TYPE_AMP: BUILD_TYPE_AMP,
    BUILD_TYPE_HTML: BUILD_TYPE_HTML,
    FILENAME: filename,
    PAGE_TITLE: config.page.title,
    PAGE_URL: '{{ link(\'/' + (name === 'index' ? '' : name) + '\') }}'
  }

  let html = fs.readFileSync(resolvePath(config.page.layout), 'utf8')

  if (config.page.scripts && config.page.scripts.length !== 0) {
    let script = ''

    for (const path of config.page.scripts) {
      script += fs.readFileSync(resolvePath(path), 'utf8')
    }

    html = html.replace(/{{ PAGE_SCRIPT }}/g, buildType === BUILD_TYPE_AMP ? '' : `<script>${script}</script>`)
  } else {
    html = html.replace(/{{ PAGE_SCRIPT }}/g, '')
  }

  if (config.page.styles && config.page.styles.length !== 0) {
    let style = ''

    for (const path of config.page.styles) {
      style += fs.readFileSync(resolvePath(path), 'utf8')
    }

    html = html.replace(/{{ PAGE_STYLE }}/g, `<style${buildType === BUILD_TYPE_AMP ? ' amp-custom' : ''}>${style}</style>`)
  } else {
    html = html.replace(/{{ PAGE_STYLE }}/g, '')
  }

  if (config.page.robots === false) {
    html = html.replace(/{{ PAGE_METATAGS }}/g, '')
    html = html.replace(/{{ STRUCTURED_DATA }}/g, '')

    extraVars.PAGE_ROBOTS = 'noindex, nofollow'
  } else {
    const canonicalTag = buildType === BUILD_TYPE_AMP ? (
      '<link rel="canonical" href="{{ PUBLIC_URL }}/' + (name === 'index' ? '' : name + '.html') + '" />'
    ) : (
      '<link rel="amphtml" href="{{ PUBLIC_URL }}/' + name + '.amp.html" />'
    )

    const metatags = '<meta name="title" content="{{ PAGE_TITLE }}" />' +
      '<meta name="description" content="{{ PAGE_DESCRIPTION }}" />' +
      '<meta name="keywords" content="{{ PAGE_KEYWORDS }}" />' +

      '<meta name="twitter:card" content="summary_large_image" />' +
      '<meta name="twitter:description" content="{{ PAGE_DESCRIPTION }}" />' +
      '<meta name="twitter:image" content="{{ PAGE_IMAGE }}" />' +
      '<meta name="twitter:title" content="{{ PAGE_TITLE }}" />' +
      '<meta name="twitter:url" content="{{ PAGE_URL }}" />' +

      '<meta property="og:description" content="{{ PAGE_DESCRIPTION }}" />' +
      '<meta property="og:image" content="{{ PAGE_IMAGE }}" />' +
      '<meta property="og:locale" content="en_US" />' +
      '<meta property="og:site_name" content="Aaron Delasy" />' +
      '<meta property="og:title" content="{{ PAGE_TITLE }}" />' +
      '<meta property="og:type" content="{{ PAGE_TYPE }}" />' +
      '<meta property="og:url" content="{{ PAGE_URL }}" />' +
      canonicalTag

    const structuredData = minifyJSON(JSON.stringify({
      '@context': 'http://schema.org',
      '@type': isAlbum ? 'MusicAlbum' : 'WebPage',
      name: '{{ PAGE_TITLE }}',
      headline: '{{ PAGE_TITLE }}',
      description: '{{ PAGE_DESCRIPTION }}',
      image: '{{ PAGE_IMAGE }}',
      keywords: '{{ PAGE_KEYWORDS }}'
    }))

    html = html.replace(/{{ PAGE_METATAGS }}/g, metatags)
    html = html.replace(/{{ STRUCTURED_DATA }}/g, `<script type="application/ld+json">${structuredData}</script>`)

    extraVars.PAGE_DESCRIPTION = config.page.description
    extraVars.PAGE_IMAGE = config.page.image
    extraVars.PAGE_KEYWORDS = config.page.keywords.join(', ')
    extraVars.PAGE_TYPE = isAlbum ? 'music:album' : 'website'
    extraVars.PAGE_ROBOTS = 'index, follow'
  }

  if (isAlbum) {
    if (config.album.services) {
      let services = ''

      if (config.album.services.youtube) {
        services += '<a class="album-layout__service" href="https://youtu.be/{{ ALBUM_SERVICE_YOUTUBE }}" rel="noopener noreferrer" target="_blank" aria-label="Watch on YouTube">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_YOUTUBE }}</div>' +
          '<div class="album-layout__service-action"><p>Watch</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_YOUTUBE }}/g, config.album.services.youtube)
      }

      if (config.album.services.spotify) {
        services += '<a class="album-layout__service" href="https://open.spotify.com/album/{{ ALBUM_SERVICE_SPOTIFY }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Spotify">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_SPOTIFY }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_SPOTIFY }}/g, config.album.services.spotify)
      }

      if (config.album.services.soundcloud) {
        services += '<a class="album-layout__service" href="https://soundcloud.com/aarondelasy/{{ ALBUM_SERVICE_SOUNDCLOUD }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on SoundCloud">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_SOUNDCLOUD }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_SOUNDCLOUD }}/g, config.album.services.soundcloud)
      }

      if (config.album.services.apple_music) {
        services += '<a class="album-layout__service" href="https://music.apple.com/album/{{ ALBUM_SERVICE_APPLE_MUSIC }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Apple Music">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_APPLE_MUSIC }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_APPLE_MUSIC }}/g, config.album.services.apple_music)
      }

      if (config.album.services.itunes_store) {
        services += '<a class="album-layout__service" href="https://itunes.apple.com/album/{{ ALBUM_SERVICE_ITUNES_STORE }}?app=itunes" rel="noopener noreferrer" target="_blank" aria-label="Download from iTunes Store">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_ITUNES_STORE }}</div>' +
          '<div class="album-layout__service-action"><p>Download</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_ITUNES_STORE }}/g, config.album.services.itunes_store)
      }

      if (config.album.services.pandora) {
        services += '<a class="album-layout__service" href="https://pandora.app.link/{{ ALBUM_SERVICE_PANDORA }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Pandora">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_PANDORA }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_PANDORA }}/g, config.album.services.pandora)
      }

      if (config.album.services.youtube_music) {
        services += '<a class="album-layout__service" href="https://music.youtube.com/playlist?list={{ ALBUM_SERVICE_YOUTUBE_MUSIC }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on YouTube Music">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_YOUTUBE_MUSIC }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_YOUTUBE_MUSIC }}/g, config.album.services.youtube_music)
      }

      if (config.album.services.google_play_music) {
        services += '<a class="album-layout__service" href="https://play.google.com/music/m/{{ ALBUM_SERVICE_GOOGLE_PLAY_MUSIC }}" rel="noopener noreferrer" target="_blank" aria-label="Download from Google Play Music">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_GOOGLE_PLAY_MUSIC }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_GOOGLE_PLAY_MUSIC }}/g, config.album.services.google_play_music)
      }

      if (config.album.services.amazon_music) {
        services += '<a class="album-layout__service" href="https://music.amazon.com/albums/{{ ALBUM_SERVICE_AMAZON_MUSIC }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Amazon Music">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_AMAZON_MUSIC }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_AMAZON_MUSIC }}/g, config.album.services.amazon_music)
      }

      if (config.album.services.amazon) {
        services += '<a class="album-layout__service" href="https://www.amazon.com/dp/{{ ALBUM_SERVICE_AMAZON }}" rel="noopener noreferrer" target="_blank" aria-label="Download from Amazon">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_AMAZON }}</div>' +
          '<div class="album-layout__service-action"><p>Download</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_AMAZON }}/g, config.album.services.amazon)
      }

      if (config.album.services.deezer) {
        services += '<a class="album-layout__service" href="https://www.deezer.com/album/{{ ALBUM_SERVICE_DEEZER }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Deezer">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_DEEZER }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_DEEZER }}/g, config.album.services.deezer)
      }

      if (config.album.services.tidal) {
        services += '<a class="album-layout__service" href="https://listen.tidal.com/album/{{ ALBUM_SERVICE_TIDAL }}" rel="noopener noreferrer" target="_blank" aria-label="Listen on Tidal">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_TIDAL }}</div>' +
          '<div class="album-layout__service-action"><p>Listen</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_TIDAL }}/g, config.album.services.tidal)
      }

      if (config.album.services.genius) {
        services += '<a class="album-layout__service" href="https://genius.com/Aaron-delasy-{{ ALBUM_SERVICE_GENIUS }}-lyrics" rel="noopener noreferrer" target="_blank" aria-label="Read lyrics on Genius">' +
          '<div class="album-layout__service-logo">{{ ICON_SERVICE_GENIUS }}</div>' +
          '<div class="album-layout__service-action"><p>Lyrics</p></div>' +
          '</a>'

        services = services.replace(/{{ ALBUM_SERVICE_GENIUS }}/g, config.album.services.genius)
      }

      html = html.replace(/{{ ALBUM_SERVICES }}/g, services)
      extraVars.ALBUM_META_CLASS = 'album-layout__meta'
    } else {
      html = html.replace(/{{ ALBUM_SERVICES }}/g, '')
      extraVars.ALBUM_META_CLASS = 'album-layout__meta album-layout__meta--noservices'
    }

    extraVars.ALBUM_EXPLICIT_ICON = config.album.explicit ? '{{ ICON_EXPLICIT }}' : ''
    extraVars.ALBUM_NAME = config.album.name
    extraVars.ALBUM_RELEASE_DATE = config.album.release_date ? `<span class="album-layout__cover-releasedate">Release ${config.album.release_date}</span>` : ''
  } else {
    html = html.replace(/{{ PAGE_CONTENT }}/g, fs.readFileSync(resolvePath(config.page.content), 'utf8'))
  }

  fs.writeFileSync(resolvePath('~/build/') + filename, minifyHTML(html, extraVars), 'utf8')
}

const cpSync = (src, dest) => {
  if (!fs.existsSync(src)) {
    return
  }

  if (fs.lstatSync(src).isDirectory()) {
    fs.mkdirSync(dest)

    fs.readdirSync(src).forEach((childItemName) => {
      cpSync(path.join(src, childItemName), path.join(dest, childItemName))
    })
  } else {
    const filesExtensionMinifiers = {
      css: minifyCSS,
      html: minifyHTML,
      js: minifyJS,
      json: minifyJSON,
      xml: minifyXML
    }

    for (const key of Object.keys(filesExtensionMinifiers)) {
      if (src.slice(-1 * (key.length + 1)) === '.' + key) {
        fs.writeFileSync(dest, filesExtensionMinifiers[key](fs.readFileSync(src, 'utf8')), 'utf8')
        return
      }
    }

    fs.copyFileSync(src, dest)
  }
}

const rmSync = (src) => {
  if (!fs.existsSync(src)) {
    return
  }

  fs.readdirSync(src).forEach((file) => {
    const curPath = path.join(src, file)

    if (fs.lstatSync(curPath).isDirectory()) {
      rmSync(curPath)
    } else {
      fs.unlinkSync(curPath)
    }
  })

  fs.rmdirSync(src)
}

if (fs.existsSync(resolvePath('~/build/'))) {
  rmSync(resolvePath('~/build/'))
}

cpSync(resolvePath('~/public/'), resolvePath('~/build/'))

for (const name of Object.keys(configs)) {
  if (name.substring(0, 2) === '//') {
    continue
  }

  process(configs[name], name, BUILD_TYPE_AMP)
  process(configs[name], name, BUILD_TYPE_HTML)
}
