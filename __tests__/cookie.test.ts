import { cookieSessionParser, cookieSessionStore, CookieOptions } from '../src/cookie'
import { Response, Http } from 'farrow-http'
import { oneMinute } from '../src/utils'
import type { RequestInfo } from 'farrow-http'
import type { ResponseInfo } from 'farrow-http/dist/responseInfo'
import { ulid } from 'ulid'
import request from 'supertest'
import { jest } from '@jest/globals'

const defaultCookieOptions: CookieOptions = {
  maxAge: 30 * 60 * 1000,
  httpOnly: true,
  overwrite: true,
}

describe('cookieSessionParser', () => {
  describe('without customCodec', () => {
    const parser = cookieSessionParser({
      sessionIdKey: 'test:sess:k',
      cookieOptions: {
        maxAge: 15 * oneMinute * 1000,
        httpOnly: true,
      },
    })

    test('should get undefined for non-existing session', async () => {
      const mockRequestInfo: RequestInfo = {
        cookies: {},
        pathname: '/',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
      }
      const result = await parser.get(mockRequestInfo)
      expect(result).toBeUndefined()
    })

    test('should set session cookie', async () => {
      const response = await parser.set('test-session-id')
      const cookies = response.info.cookies as NonNullable<ResponseInfo['cookies']>
      expect(cookies).toBeDefined()
      const cookie = cookies['test:sess:k']
      expect(cookie).toBeDefined()
      expect(cookie?.options?.httpOnly).toBe(true)
      expect(cookie?.options?.maxAge).toBe(15 * oneMinute * 1000)
    })

    test('should remove session cookie', async () => {
      const response = await parser.remove('test-session-id')
      const cookies = response.info.cookies as NonNullable<ResponseInfo['cookies']>
      expect(cookies).toBeDefined()
      const cookie = cookies['test:sess:k']
      expect(cookie).toBeDefined()
      expect(cookie?.options?.maxAge).toBe(-1)
    })
  })

  describe('with customCodec', () => {
    const customCodec = {
      encode: (plainSessionId: string) => Buffer.from(plainSessionId).toString('hex'),
      decode: (encodedSessionId: string) => Buffer.from(encodedSessionId, 'hex').toString(),
    }

    const parser = cookieSessionParser({
      sessionIdKey: 'test:sess:k',
      customCodec,
      cookieOptions: {
        maxAge: 15 * oneMinute * 1000,
        httpOnly: true,
      },
    })

    test('should encode session ID when setting cookie', async () => {
      const sessionId = 'test-session-id'
      const response = await parser.set(sessionId)
      const cookies = response.info.cookies as NonNullable<ResponseInfo['cookies']>
      const cookie = cookies['test:sess:k']
      expect(cookie?.value).toBe(customCodec.encode(sessionId))
    })

    test('should decode session ID when getting from cookie', async () => {
      const sessionId = 'test-session-id'
      const encodedSessionId = customCodec.encode(sessionId)
      const mockRequestInfo: RequestInfo = {
        cookies: { 'test:sess:k': encodedSessionId },
        pathname: '/',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
      }
      const result = await parser.get(mockRequestInfo)
      expect(result).toBe(sessionId)
    })
  })

  describe('customCodec', () => {
    test('should use custom codec for encoding and decoding', async () => {
      const customCodec = {
        encode: jest.fn(() => 'CUSTOM_ENCODED_ID'),
        decode: jest.fn(() => 'test-session-id'),
      }

      const mockRequestInfo = {
        cookies: {
          'sess:k': 'CUSTOM_ENCODED_ID',
        },
        pathname: '/',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
        search: '',
      } as RequestInfo

      const parser = cookieSessionParser({
        sessionIdKey: 'sess:k',
        customCodec,
        cookieOptions: defaultCookieOptions,
      })

      // 测试 get 方法
      const sessionId = await parser.get(mockRequestInfo)
      expect(sessionId).toBe('test-session-id')
      expect(customCodec.decode).toHaveBeenCalledWith('CUSTOM_ENCODED_ID')

      // 测试 set 方法
      const response = await parser.set('test-session-id')
      expect(customCodec.encode).toHaveBeenCalledWith('test-session-id')
      expect(response.info.cookies?.['sess:k']?.value).toBe('CUSTOM_ENCODED_ID')
    })

    test('should fallback to base64 when customCodec is not provided', async () => {
      const base64SessionId = Buffer.from('test-session-id').toString('base64')
      const mockRequestInfo = {
        cookies: {
          'sess:k': base64SessionId,
        },
        pathname: '/',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
      } as RequestInfo

      const parser = cookieSessionParser({
        sessionIdKey: 'sess:k',
        cookieOptions: defaultCookieOptions,
      })

      // 测试 get 方法
      const sessionId = await parser.get(mockRequestInfo)
      expect(sessionId).toBe('test-session-id')

      // 测试 set 方法
      const response = await parser.set('test-session-id')
      expect(response.info.cookies?.['sess:k']?.value).toBe(base64SessionId)
    })
  })
})

describe('cookieSessionStore', () => {
  const sessionStoreKey = Buffer.alloc(32).fill('test:sess:store:key:padding').toString()
  let http: ReturnType<typeof Http>

  beforeEach(() => {
    http = Http()
  })

  describe('session creation and basic operations', () => {
    test('should create new session', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      let session: { sessionId: string; sessionData: { userId: string } } | false

      http.use(async () => {
        session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        expect(session.sessionId).toMatch(/^[0-9A-Z]{26}$/) // ulid 格式
        expect(session.sessionData).toEqual({})
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle session expiration', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: false,
          time: -1000, // 已过期
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      let sessionData: { userId: string } | undefined

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        const setResult = await store.set(session.sessionId, { userId: '123' })
        expect(setResult).toBe(true)
        sessionData = await store.get(session.sessionId)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
      expect(sessionData).toBeUndefined()
    })

    test('should handle rolling expiration', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      let session: { sessionId: string; sessionData: { userId: string } } | false
      let updatedData: { userId: string } | undefined

      http.use(async () => {
        session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        const setResult = await store.set(session.sessionId, { userId: '123' })
        expect(setResult).toBe(true)
        // 模拟一段时间后的访问，确保 rolling expiration 生效
        await new Promise((resolve) => setTimeout(resolve, 100))
        updatedData = await store.get(session.sessionId)
        expect(updatedData).toBeDefined()
        expect(updatedData?.userId).toBe('123')
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })
  })

  describe('error handling', () => {
    test('should handle invalid session data', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        // @ts-ignore
        const setResult = await store.set(session.sessionId, { invalid: Buffer.from([1, 2, 3]) })
        expect(setResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle missing session data', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      let sessionData: { userId: string } | undefined

      http.use(async () => {
        const invalidSessionId = ulid() // 使用一个不存在的 ulid
        sessionData = await store.get(invalidSessionId)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
      expect(sessionData).toBeUndefined()
    })

    test('should handle encryption errors', async () => {
      const store = cookieSessionStore({
        sessionStoreKey: 'invalid_key',
        expiresOptions: {
          rolling: true,
          time: oneMinute * 1000,
        },
        cookieOptions: defaultCookieOptions,
      })

      http.use(async () => {
        const session = await store.create()
        expect(session).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle decryption errors', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey: 'test_key',
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const data = await store.get('invalid-session-id')
        expect(data).toBeUndefined()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle expired session', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: false,
          time: -1000, // 已过期
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        const setResult = await store.set(session.sessionId, { userId: '123' })
        expect(setResult).toBe(true)
        // 等待一段时间确保会话过期
        await new Promise((resolve) => setTimeout(resolve, 100))
        const data = await store.get(session.sessionId)
        expect(data).toBeUndefined()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle invalid session ID format', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const setResult = await store.set('invalid-session-id', { userId: '123' })
        expect(setResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle empty session data', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        // @ts-ignore
        const setResult = await store.set(session.sessionId, null)
        expect(setResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle destroy with invalid session ID', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const destroyResult = await store.destroy('invalid-session-id')
        expect(destroyResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })
  })

  describe('edge cases', () => {
    test('should handle null session data', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        // @ts-ignore
        const setResult = await store.set(session.sessionId, null)
        expect(setResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle undefined session data', async () => {
      const store = cookieSessionStore<{ userId: string }>({
        sessionStoreKey,
        expiresOptions: {
          rolling: true,
          time: 15 * oneMinute * 1000,
        },
        cookieOptions: {
          maxAge: 15 * oneMinute * 1000,
          httpOnly: true,
        },
      })

      http.use(async () => {
        const session = await store.create()
        if (!session) {
          return Response.json({ error: 'Failed to create session' }).status(500)
        }
        // @ts-ignore
        const setResult = await store.set(session.sessionId, undefined)
        expect(setResult).toBe(false)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })
  })
})
