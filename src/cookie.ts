import { createCipheriv, Cipher, createHash } from 'crypto'
import type { SetOption } from 'cookies'
import { sessionHeaderCtx, SessionStore, SessionParser } from './session'
import { Response, useRequestInfo } from 'farrow-http'
import { ulid } from 'ulid'
import { oneMinute } from './utils'
import { createContext } from 'farrow-pipeline'
export type CookieOptions = Omit<SetOption, 'expires' | 'secureProxy' | 'signed' | 'secure'>
const defaultCookieOptions = {
  maxAge: 30 * oneMinute * 1000,
  httpOnly: true,
  overwrite: true,
} satisfies CookieOptions
export type CookieSessionParserOptions = {
  sessionIdKey: string
  customCodec?: {
    encode: (plainSessionId: string) => string
    decode: (encodedSessionId: string) => string
  }
  cookieOptions: CookieOptions
}
export const cookieSessionParser = (cookieSessionOptions?: CookieSessionParserOptions): SessionParser => {
  const options = {
    sessionIdKey: 'sess:k',
    cookieOptions: defaultCookieOptions,
    ...cookieSessionOptions,
  }
  return {
    async get(requestInfo) {
      const encodedSessionId = requestInfo.cookies?.[options.sessionIdKey]
      if (encodedSessionId === undefined) {
        return undefined
      }
      return options.customCodec
        ? options.customCodec.decode(encodedSessionId)
        : Buffer.from(encodedSessionId, 'base64').toString('utf8')
    },
    async set(plainSessionId) {
      const encodedSessionId = options.customCodec
        ? options.customCodec.encode(plainSessionId)
        : Buffer.from(plainSessionId).toString('base64')
      return Response.cookie(options.sessionIdKey, encodedSessionId, options.cookieOptions)
    },
    async remove() {
      return Response.cookie(options.sessionIdKey, '', { ...options.cookieOptions, maxAge: -1 })
    },
  }
}
export type CookieSessionStoreOptions = {
  sessionStoreKey: string
  expiresOptions: {
    rolling: boolean
    time: number
  }
  cookieOptions: CookieOptions
}
function idToIv(sessionId: string) {
  const hash = createHash('sha256').update(sessionId).digest()
  const iv = hash.subarray(0, 16).toString('hex')
  return iv
}
export const cookieSessionStore = <D>(cookieSessionStoreOptions?: CookieSessionStoreOptions): SessionStore<D> => {
  const options = {
    sessionStoreKey: 'sess:s',
    cookieOptions: defaultCookieOptions,
    expiresOptions: {
      rolling: true,
      time: 30 * oneMinute * 1000,
    },
    ...cookieSessionStoreOptions,
  }
  const CipherContext = createContext<Cipher | null>(null)
  const createCipher = (sessionId: string) => {
    try {
      const cipherKey = createHash('sha256').update(options.sessionStoreKey).digest('hex')
      const cipher = createCipheriv('aes-256-cbc', cipherKey, idToIv(sessionId))
      CipherContext.set(cipher)
      return cipher
    } catch (err) {
      const error = err as Error
      throw new Error(`Failed to create cipher: ${error.message}`)
    }
  }

  return {
    async create() {
      const sessionId = ulid()
      createCipher(sessionId)
      return {
        sessionId,
        sessionData: {} as D,
      }
    },
    async get(sessionId) {
      const requestInfo = useRequestInfo()
      const sessionData = requestInfo.cookies?.[options.sessionStoreKey]
      // 如果sessionData不存在，则返回undefined
      if (sessionData === undefined) {
        return undefined
      }
      // 如果cipher不存在，则创建新的cipher
      let cipher = CipherContext.get()
      if (cipher === null) {
        cipher = createCipher(sessionId)
      }
      // 解密sessionData
      try {
        const decrypted = cipher.update(sessionData, 'base64', 'utf8')
        const decryptedData = JSON.parse(decrypted)

        // 检查session是否过期
        const now = Date.now()
        if (decryptedData._expires && decryptedData._expires < now) {
          await this.destroy(sessionId)
          return undefined
        }

        // 如果rolling为true,则更新过期时间
        if (options.expiresOptions.rolling) {
          decryptedData._expires = now + options.expiresOptions.time
          await this.set(sessionId, decryptedData)
        }

        return decryptedData
      } catch {
        // 如果解密失败(可能sessionData不存在，或者sessionData被篡改)，返回 undefined
        return undefined
      }
    },
    async set(sessionId, sessionData) {
      let cipher = CipherContext.get()
      if (cipher === null) {
        cipher = createCipher(sessionId)
      }
      const encrypted = cipher.update(
        JSON.stringify({
          ...sessionData,
          _expires: Date.now() + options.expiresOptions.time,
        }),
        'utf8',
        'base64',
      )
      const cookieOptions = {
        ...options.cookieOptions,
        maxAge: options.expiresOptions.time,
      }

      sessionHeaderCtx.set([
        ...sessionHeaderCtx.get(),
        Response.cookie(options.sessionStoreKey, encrypted, cookieOptions),
      ])
      return true
    },
    async destroy(sessionId) {
      sessionHeaderCtx.set([
        ...sessionHeaderCtx.get(),
        Response.cookie(options.sessionStoreKey, '', { ...options.cookieOptions, maxAge: -1 }),
      ])
      return true
    },
  }
}
