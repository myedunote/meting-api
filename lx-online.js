/*!
 * @name Meting-API 本地源
 * @description 对接自部署 Meting-API（网易/QQ/酷狗，支持无损）
 * @version 2.0.0
 * @author Meting-API
 */

// ====================== 配置区（按需修改） ======================
// 1. 你的 Meting-API 服务地址，结尾不要带 /
//    例如: http://127.0.0.1:3000  或  https://api.example.com
const API_BASE = 'https://meting.isedu.top'

// 2. 管理后台「API Token」页面创建的 Token（必填）
//    没有它所有 /api 请求都会返回 401
const API_TOKEN = 'mapi_TuALkc-9BHCfHS8WKDyciS3pKFyshoj4TZQ3TX7KSIA'

// 单次请求超时（毫秒）。高音质/多 Cookie 容灾时上游较慢，可适当调大
const REQUEST_TIMEOUT = 20000

// 播放链接内存缓存时长（毫秒）。CDN 链接有时效，不宜设太长
const CACHE_TTL = 10 * 60 * 1000
// ================================================================

// 洛雪音源 -> Meting server 参数（新版 API 已移除 kuwo/baidu）
const SOURCE_SERVER = {
  wy: 'netease', // 网易云
  tx: 'tencent', // QQ音乐
  kg: 'kugou'    // 酷狗
}

// 洛雪音质 -> 各平台 quality 参数（flac24bit 对应平台最高档位）
const QUALITY_MAP = {
  wy: { '128k': '128', '320k': '320', 'flac': 'flac', 'flac24bit': 'hires' },
  tx: { '128k': '128', '320k': '320', 'flac': 'flac', 'flac24bit': 'master' },
  kg: { '128k': '128', '320k': '320', 'flac': 'flac', 'flac24bit': 'hires' }
}

const { EVENT_NAMES, request, send, on } = globalThis.lx

// 简易 TTL 缓存（Map 按插入顺序淘汰最旧条目）
const urlCache = new Map()
const cacheGet = (key) => {
  const hit = urlCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.time > CACHE_TTL) {
    urlCache.delete(key)
    return null
  }
  return hit.url
}
const cacheSet = (key, url) => {
  if (urlCache.size > 300) urlCache.delete(urlCache.keys().next().value)
  urlCache.set(key, { url, time: Date.now() })
}

const httpGet = (url) => new Promise((resolve, reject) => {
  request(url, {
    method: 'GET',
    timeout: REQUEST_TIMEOUT,
    headers: { Authorization: 'Bearer ' + API_TOKEN }
  }, (err, resp, body) => {
    if (err) return reject(new Error('请求 Meting-API 失败: ' + (err && err.message ? err.message : String(err))))
    if (resp.statusCode === 401) {
      return reject(new Error('API Token 无效，请在脚本配置区填写管理后台创建的 Token'))
    }
    if (resp.statusCode === 403) {
      return reject(new Error('服务端返回 403：无可用播放链接（检查后台 Cookie 是否有效、会员权限是否足够）'))
    }
    if (resp.statusCode !== 200) {
      const msg = body && body.error ? body.error : (body && body.message ? body.message : '')
      return reject(new Error('Meting-API 返回 HTTP ' + resp.statusCode + (msg ? ' - ' + msg : '')))
    }
    resolve(body)
  })
})

// 取平台对应的歌曲 ID
// 酷狗需要传文件 hash（优先取当前音质对应的 hash），其余平台用 songmid
const getSongId = (source, musicInfo, quality) => {
  if (source === 'kg') {
    const qualityHash = musicInfo._types && musicInfo._types[quality] && musicInfo._types[quality].hash
    return qualityHash || musicInfo.hash
  }
  return musicInfo.songmid
}

const getMusicUrl = async (source, musicInfo, quality) => {
  const server = SOURCE_SERVER[source]
  if (!server) throw new Error('不支持的音源: ' + source)
  if (!API_TOKEN) throw new Error('未配置 API_TOKEN，请编辑脚本顶部的配置区')

  const songId = getSongId(source, musicInfo, quality)
  if (songId === undefined || songId === null || String(songId) === '') {
    throw new Error('歌曲信息缺少 ID，无法查询播放链接')
  }

  const cacheKey = source + '|' + quality + '|' + songId
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  // 直接请求 type=url 拿 JSON 形式的真实播放地址（带 Bearer Token 鉴权），
  // 服务端会自动使用后台配置的 Cookie，并按会员权限自动降级音质
  const body = await httpGet(
    API_BASE + '/api?server=' + server + '&type=url&id=' + encodeURIComponent(songId) +
    '&quality=' + QUALITY_MAP[source][quality]
  )
  const data = typeof body === 'string' ? JSON.parse(body) : body
  if (!data || !data.url || !/^https?:\/\//.test(data.url)) {
    throw new Error('未获取到有效的播放链接' + (data && data.quality ? '（实际音质: ' + data.quality + '）' : ''))
  }

  cacheSet(cacheKey, data.url)
  return data.url
}

send(EVENT_NAMES.inited, {
  openDevTools: false,
  message: 'Meting-API 本地源 (' + API_BASE + ')',
  sources: {
    wy: { name: '网易云音乐', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
    tx: { name: 'QQ音乐', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
    kg: { name: '酷狗音乐', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] }
  }
})

on(EVENT_NAMES.request, ({ source, action, info }) => {
  if (action !== 'musicUrl') {
    return Promise.reject(new Error('不支持的操作: ' + action))
  }
  return getMusicUrl(source, info.musicInfo, info.type)
})
