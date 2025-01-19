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
  sessionInfoKey?: string
  customCodec?: {
    encode: (plainSessionId: string) => string
    decode: (encodedSessionId: string) => string
  }
  cookieOptions?: CookieOptions
}
export const cookieSessionParser = <Info, Meta>(
  cookieSessionOptions?: CookieSessionParserOptions,
): SessionParser<Info, Meta> => {
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
        const sessionInfo = JSON.parse(decodedSessionInfo) as Info
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
      const expiresTime =
        (
          plainSessionMeta as {
            expireTime?: string | number
          }
        ).expireTime ??
        (
          plainSessionMeta as {
            expiresTime?: string | number
          }
        ).expiresTime
      const expiresOptions = expiresTime
        ? { expires: new Date(Number(expiresTime)) }
        : {
            maxAge: options.cookieOptions.maxAge,
          }
      return Response.cookie(options.sessionInfoKey, encodedSessionInfo, {
        ...options.cookieOptions,
        ...expiresOptions,
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
    /**
     * when use time, it will override maxAge
     */
    time?: number | (() => number)
  }
  cookieOptions: CookieOptions
}
export function idToIv(sessionId: string) {
  return createHash('sha256').update(sessionId).digest().slice(0, 16)
}
export const cookieSessionStore = <Data>(
  cookieSessionStoreOptions?: Partial<CookieSessionStoreOptions<Data>>,
): SessionStore<Data, string, string> => {
  const options = {
    sessionStoreKey: 'sess:s',
    cookieOptions: defaultCookieOptions,
    expiresOptions: {
      rolling: false,
    },
    ...cookieSessionStoreOptions,
  } as CookieSessionStoreOptions<Data>
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
  const maxAge = options.expiresOptions.time
    ? typeof options.expiresOptions.time === 'function'
      ? options.expiresOptions.time()
      : options.expiresOptions.time
    : options.cookieOptions.maxAge!
  return {
    async create(request, sessionData) {
      const sessionId = ulid()
      createCipher(sessionId)
      return {
        sessionMeta: sessionId,
        sessionData: options.dataCreator ? options.dataCreator(request, sessionData) : ({} as Data),
      }
    },
    async get(sessionId) {
      const requestInfo = useRequestInfo()
      const sessionData = requestInfo.cookies?.[options.sessionStoreKey]
      // 如果sessionData不存在，则返回null
      if (sessionData === undefined) {
        return null
      }
      // 解密sessionData
      const decipher = createDecipher(sessionId)
      try {
        let decrypted = decipher.update(sessionData, 'base64', 'utf8')
        decrypted += decipher.final('utf8')
        const decryptedData = JSON.parse(decrypted)
        // 检查session是否过期
        const now = Date.now()
        if (decryptedData._expires && decryptedData._expires < now) {
          await this.destroy(sessionId)
          return null
        }

        // 如果rolling为true,则更新过期时间
        if (options.expiresOptions.rolling) {
          // 判断time存不存在，如果存在，则使用time，否则使用maxAge；然后判断time是函数还是数字，如果是函数，则使用函数返回值，否则直接使用

          decryptedData._expires = now + maxAge
          await this.set(sessionId, decryptedData)
        }

        return decryptedData
      } catch {
        // 如果解密失败(可能sessionData不存在，或者sessionData被篡改)，返回 null
        return null
      }
    },
    async set(sessionId, sessionData) {
      const cipher = createCipher(sessionId)
      let encrypted = cipher.update(
        JSON.stringify({
          ...sessionData,
          _expires: Date.now() + maxAge,
        }),
        'utf8',
        'base64',
      )
      encrypted += cipher.final('base64')
      const cookieOptions = {
        ...options.cookieOptions,
        maxAge: maxAge,
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
