import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// cookie-shim.js 是无导出的经典脚本，靠副作用安装垫片；
// 这里在 vm 沙箱里执行它来直接测试其行为。
const here = fileURLToPath(new URL('.', import.meta.url))
const shimSource = readFileSync(resolve(here, 'cookie-shim.js'), 'utf8')

const createContext = ({ cookieAccessBlocked }) => {
    const sandbox = {
        Date,
        Number,
        String,
        Object,
        Map,
        Boolean,
        globalThis: null,
    }
    sandbox.globalThis = sandbox
    const document = {
        get cookie() {
            if (cookieAccessBlocked) throw new Error('Failed to read the \'cookie\' property from \'Document\': The document is sandboxed and lacks the \'allow-same-origin\' flag.')
            return ''
        },
        set cookie(value) {
            if (cookieAccessBlocked) throw new Error('Failed to set the \'cookie\' property on \'Document\': The document is sandboxed and lacks the \'allow-same-origin\' flag.')
            void value
        },
    }
    sandbox.document = document
    vm.createContext(sandbox)
    vm.runInContext(shimSource, sandbox)
    return sandbox
}

describe('cookie-shim', () => {
    it('installs an in-memory cookie jar when native cookie access is blocked', () => {
        const sandbox = createContext({ cookieAccessBlocked: true })
        const document = sandbox.document

        document.cookie = 'sid=abc; path=/'
        document.cookie = 'verify_result=ok'
        expect(document.cookie).toBe('sid=abc; verify_result=ok')
    })

    it('overwrites an existing cookie by name', () => {
        const sandbox = createContext({ cookieAccessBlocked: true })
        const document = sandbox.document

        document.cookie = 'sid=first'
        document.cookie = 'sid=second'
        expect(document.cookie).toBe('sid=second')
    })

    it('drops a cookie on max-age=0 and keeps session cookies readable', () => {
        const sandbox = createContext({ cookieAccessBlocked: true })
        const document = sandbox.document

        document.cookie = 'sid=abc'
        document.cookie = 'sid=; max-age=0'
        document.cookie = 'keep=1'
        expect(document.cookie).toBe('keep=1')
    })

    it('exposes the installer so pages can install on another document', () => {
        const sandbox = createContext({ cookieAccessBlocked: true })
        expect(typeof sandbox.__qishuiInstallCookieShim).toBe('function')
        const another = {}
        Object.defineProperty(another, 'cookie', {
            get() { throw new Error('blocked') },
            set() { throw new Error('blocked') },
            configurable: true,
        })
        expect(sandbox.__qishuiInstallCookieShim(another)).toBe(true)
        another.cookie = 'a=1'
        expect(another.cookie).toBe('a=1')
    })

    it('does not touch document.cookie when native access works', () => {
        const sandbox = createContext({ cookieAccessBlocked: false })
        // 未安装垫片时，document.cookie 仍是原始的 getter/setter，
        // 且不会暴露内存 jar 行为（写入后读取仍是空串）。
        sandbox.document.cookie = 'sid=abc'
        expect(sandbox.document.cookie).toBe('')
        expect(sandbox.__qishuiInstallCookieShim(sandbox.document)).toBe(false)
    })
})
