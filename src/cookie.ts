import { createCipheriv, createDecipheriv, createHash } from 'crypto'
import type { SetOption } from 'cookies'
import { sessionHeaderCtx, SessionStore, SessionParser } from './session'
import { Response, useRequestInfo, RequestInfo } from 'farrow-http'
import { ulid } from 'ulid'
import { oneMinute } from './utils'
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
export const cookieSessionParser = <I, M>(cookieSessionOptions?: CookieSessionParserOptions): SessionParser<I, M> => {
  const options = {
    sessionInfoKey: 'sess:k',
    cookieOptions: defaultCookieOptions,
    ...cookieSessionOptions,
  }
  return {
    async get(requestInfo) {
      const encodedSessionInfo = requestInfo.cookies?.[options.sessionInfoKey]
      if (encodedSessionInfo === undefined) {
        return null
      }
      const decodedSessionInfo = options.customCodec
        ? options.customCodec.decode(encodedSessionInfo)
        : Buffer.from(encodedSessionInfo, 'base64').toString('utf8')
      try {
        const sessionInfo = JSON.parse(decodedSessionInfo) as I
        return sessionInfo
      } catch {
        return null
      }
    },
    async set(plainSessionMeta) {
      const encodedSessionMeta = JSON.stringify(plainSessionMeta)
      const encodedSessionInfo = options.customCodec
        ? options.customCodec.encode(encodedSessionMeta)
        : Buffer.from(encodedSessionMeta).toString('base64')
      const expireTime =
        (
          plainSessionMeta as {
            expireTime?: string | number
          }
        ).expireTime ??
        (
          plainSessionMeta as {
            expiresTime?: string | number
          }
        ).expiresTime ??
        options.cookieOptions.maxAge
      return Response.cookie(options.sessionInfoKey, encodedSessionInfo, {
        ...options.cookieOptions,
        maxAge: Number(expireTime),
      })
    },
    async remove() {
      return Response.cookie(options.sessionInfoKey, '', { ...options.cookieOptions, maxAge: -1 })
    },
  }
}
export type CookieSessionStoreOptions<D> = {
  sessionStoreKey: string
  dataCreator: (request: RequestInfo, sessionData?: D) => D
  expiresOptions: {
    rolling: boolean
    time: number | (() => number)
  }
  cookieOptions: CookieOptions
}
function idToIv(sessionId: string) {
  return createHash('sha256').update(sessionId).digest().slice(0, 16)
}
export const cookieSessionStore = <D>(
  cookieSessionStoreOptions?: Partial<CookieSessionStoreOptions<D>>,
): SessionStore<D, string, string> => {
  const options = {
    sessionStoreKey: 'sess:s',
    cookieOptions: defaultCookieOptions,
    expiresOptions: {
      rolling: false,
      time: 30 * oneMinute * 1000,
    },
    ...cookieSessionStoreOptions,
  }
  const key = createHash('sha256').update(options.sessionStoreKey).digest()
  const createCipher = (sessionId: string) => {
    try {
      const cipher = createCipheriv('aes-256-cbc', key, idToIv(sessionId))
      return cipher
    } catch (err) {
      const error = err as Error
      throw new Error(`Failed to create cipher: ${error.message}`)
    }
  }
  const createDecipher = (sessionId: string) => {
    const decipher = createDecipheriv('aes-256-cbc', key, idToIv(sessionId))
    return decipher
  }

  return {
    async create(request, sessionData) {
      const sessionId = ulid()
      createCipher(sessionId)
      return {
        sessionMeta: sessionId,
        sessionData: options.dataCreator ? options.dataCreator(request, sessionData) : ({} as D),
      }
    },
    async get(sessionId) {
      const requestInfo = useRequestInfo()
      const sessionData = requestInfo.cookies?.[options.sessionStoreKey]
      // 如果sessionData不存在，则返回undefined
      if (sessionData === undefined) {
        return undefined
      }
      console.log('sessionData found in cookie', sessionData)
      // 解密sessionData
      const decipher = createDecipher(sessionId)
      try {
        let decrypted = decipher.update(sessionData, 'base64', 'utf8')
        decrypted += decipher.final('utf8')
        console.log('decrypted', decrypted)
        const decryptedData = JSON.parse(decrypted)
        console.log('decryptedData', decryptedData)
        // 检查session是否过期
        const now = Date.now()
        if (decryptedData._expires && decryptedData._expires < now) {
          await this.destroy(sessionId)
          return undefined
        }

        // 如果rolling为true,则更新过期时间
        if (options.expiresOptions.rolling) {
          const expireTime =
            typeof options.expiresOptions.time === 'function'
              ? options.expiresOptions.time()
              : options.expiresOptions.time
          decryptedData._expires = now + expireTime
          await this.set(sessionId, decryptedData)
        }

        return decryptedData
      } catch {
        // 如果解密失败(可能sessionData不存在，或者sessionData被篡改)，返回 undefined
        return undefined
      }
    },
    async set(sessionId, sessionData) {
      const cipher = createCipher(sessionId)
      const expireTime =
        typeof options.expiresOptions.time === 'function' ? options.expiresOptions.time() : options.expiresOptions.time
      let encrypted = cipher.update(
        JSON.stringify({
          ...sessionData,
          _expires: Date.now() + expireTime,
        }),
        'utf8',
        'base64',
      )
      encrypted += cipher.final('base64')
      const cookieOptions = {
        ...options.cookieOptions,
        maxAge: expireTime,
      }

      sessionHeaderCtx.set([
        ...sessionHeaderCtx.get(),
        Response.cookie(options.sessionStoreKey, encrypted, cookieOptions),
      ])
      return true
    },
    async destroy() {
      sessionHeaderCtx.set([
        ...sessionHeaderCtx.get(),
        Response.cookie(options.sessionStoreKey, '', { ...options.cookieOptions, maxAge: -1 }),
      ])
      return true
    },
  }
}
