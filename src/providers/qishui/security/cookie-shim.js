/**
 * 沙箱 iframe 内 document.cookie 的内存垫片。
 *
 * security_host.html 以 sandbox="allow-scripts" 内嵌（opaque origin），
 * 浏览器对其 document.cookie 的读写都会抛出
 * "The document is sandboxed and lacks the 'allow-same-origin' flag"。
 * 官方二次验证组件完成后会直接写 document.cookie 记录验证态，写入一旦
 * 抛错就会中断验证回调链。这里在检测到原生访问被拒时，把 document.cookie
 * 替换为页面内存实现；真实源页面（signer 的无头会话）不满足安装条件，
 * 仍由浏览器原生管理 Cookie。
 */
(function (root) {
  'use strict';

  const installCookieShim = (doc) => {
    // 沙箱内对 document.cookie 的读取本身就会抛 SecurityError，
    // 以此作为安装条件，避免依赖对 origin 值的假设。
    let blocked = false;
    try { void doc.cookie; } catch (_) { blocked = true; }
    if (!blocked) return false;

    const jar = new Map();
    const readPair = (part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return null;
      return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1) };
    };
    const readExpires = (attrs, now) => {
      for (const attr of attrs) {
        const eq = attr.indexOf('=');
        if (eq < 0) continue;
        const key = attr.slice(0, eq).trim().toLowerCase();
        const raw = attr.slice(eq + 1).trim();
        if (key === 'max-age') {
          const seconds = Number(raw);
          if (Number.isFinite(seconds)) return now + seconds * 1000;
        } else if (key === 'expires') {
          const time = Date.parse(raw);
          if (Number.isFinite(time)) return time;
        }
      }
      return Number.POSITIVE_INFINITY;
    };

    Object.defineProperty(doc, 'cookie', {
      configurable: true,
      get() {
        const now = Date.now();
        const parts = [];
        for (const [name, entry] of jar) {
          if (entry.expires > now) parts.push(`${name}=${entry.value}`);
          else jar.delete(name);
        }
        return parts.join('; ');
      },
      set(value) {
        const segments = String(value).split(';');
        const pair = readPair(segments[0]);
        if (!pair || !pair.name) return;
        const now = Date.now();
        const expires = readExpires(segments.slice(1), now);
        if (expires <= now) {
          jar.delete(pair.name);
          return;
        }
        jar.set(pair.name, { value: pair.value, expires });
      },
    });
    return true;
  };

  root.__qishuiInstallCookieShim = installCookieShim;
  if (typeof document !== 'undefined' && document) installCookieShim(document);
})(typeof globalThis !== 'undefined' ? globalThis : this);
