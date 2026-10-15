import Providers from '../providers/index.js'
import store from '../admin/store.js'
import { isValidQuality, buildUrlPayload } from '../quality.js'
import { resolveQishuiSignerUrl } from './qishui-signer-config.js'
import { loadQishuiAudio } from '../providers/qishui/audio.js'

// 各平台音频 CDN 的来源要求：浏览器直连会被 CORS 拦截（QQ/酷狗）或缺少
// Referer/UA 校验，统一由服务端代理拉取后回传给下载页。
const CDN_HEADERS = {
    netease: { Referer: 'https://music.163.com/' },
    tencent: { Referer: 'https://y.qq.com/' },
    kugou: { Referer: 'https://www.kugou.com/' },
    qishui: { Referer: 'https://www.qishui.com/' },
}
const PROXY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * GET /audio/download?server=&id=&quality=
 * 与 /api 相同的 Bearer API Token 鉴权；按 (server, id) 重新解析音频地址，
 * 不接受任意 URL，天然规避 SSRF。汽水的加密音频复用既有解密与缓存管线。
 */
export const audioDownloadHandler = async (c) => {
    const server = String(c.req.query('server') || '').trim().toLowerCase()
    const id = String(c.req.query('id') || '').trim()
    const quality = String(c.req.query('quality') || '').trim().toLowerCase()

    if (!id) return c.json({ success: false, error: '缺少歌曲 id' }, 400)
    const providers = new Providers()
    if (!providers.get_provider_list().includes(server)) {
        return c.json({ success: false, error: 'server 参数不合法' }, 400)
    }
    if (quality && !isValidQuality(server, quality)) {
        return c.json({ success: false, error: 'quality 参数不合法' }, 400)
    }

    const storedCookie = quality
        ? store.getActiveCookieForQuality(server, quality, false)
        : store.getActiveCookie(server)
    const cookie = storedCookie?.cookie || ''

    // 汽水取流依赖外部签名服务（X-Medusa/X-Helios），失败原因容易和
    // Cookie 问题混淆，先做区分诊断再调用，给出可行动的提示。
    if (server === 'qishui') {
        const hasActiveCookie = store.getCookies(server)
            .some(account => account.isActive && account.isValid !== false)
        if (!hasActiveCookie) {
            return c.json({ success: false, error: '汽水需要先在管理后台扫码登录并保存 Cookie' }, 400)
        }
        if (!resolveQishuiSignerUrl(store.getQishuiSignerUrl())) {
            return c.json({
                success: false,
                error: '汽水取流需要签名服务（X-Medusa/X-Helios）：本部署未配置 QISHUI_SIGNER_URL。'
                    + '歌单与歌词可直接使用，但获取播放地址必须在管理后台配置签名服务地址，'
                    + '或设置环境变量 QISHUI_SIGNER_URL 后重启',
            }, 503)
        }
    }

    const signerUrl = server === 'qishui' ? resolveQishuiSignerUrl(store.getQishuiSignerUrl()) : ''

    let payload
    try {
        const data = await providers.get(server).handle('url', id, cookie, { quality, signerUrl })
        payload = typeof data === 'string'
            ? buildUrlPayload(data, quality || 'standard', quality || 'standard', server)
            : data
    } catch (error) {
        return c.json({ success: false, error: error?.message || '获取音频地址失败' }, 502)
    }

    const url = String(payload?.url || '')
    if (!url) {
        if (server === 'qishui') {
            return c.json({
                success: false,
                error: '汽水签名服务未返回播放地址：请检查 QISHUI_SIGNER_URL 指向的服务是否可用，'
                    + '以及 Cookie 是否仍具备该音质的播放权限',
            }, 503)
        }
        return c.json({ success: false, error: 'no url（可能需要先在后台保存可用 Cookie）' }, 403)
    }
    if (url.startsWith('@')) return c.json({ success: false, error: url.slice(1) || 'no url' }, 403)

    try {
        // 汽水的 CENC 加密音频必须解密后才能写入本地标签
        if (server === 'qishui' && payload.auth) {
            const audio = await loadQishuiAudio(url, payload.auth)
            return new Response(audio.buffer, {
                headers: {
                    'Content-Type': audio.contentType || 'audio/mp4',
                    'Content-Length': String(audio.buffer.length),
                    'Cache-Control': 'no-store',
                },
            })
        }

        const headers = { 'User-Agent': PROXY_UA, ...(CDN_HEADERS[server] || {}) }
        const upstream = await fetch(url, { headers, redirect: 'follow' })
        if (!upstream.ok) {
            return c.json({ success: false, error: `音频 CDN 返回 ${upstream.status}` }, 502)
        }
        const responseHeaders = {
            'Content-Type': String(upstream.headers.get('content-type') || 'application/octet-stream'),
            'Cache-Control': 'no-store',
        }
        const length = upstream.headers.get('content-length')
        if (length) responseHeaders['Content-Length'] = length
        return new Response(upstream.body, { headers: responseHeaders })
    } catch (error) {
        return c.json({ success: false, error: error?.message || '音频拉取失败' }, 502)
    }
}
