import { describe } from '@jest/globals'
import { cookieSessionParser, idToIv, cookieSessionStore } from '../src/cookie'
import { Http, Response } from 'farrow-http'
import request from 'supertest'
import { createFarrowSession, createSessionCtx, sessionHeaderCtx, SessionStore } from '../src/session'

describe('idToIv function', () => {
  test('should generate correct length of initialization vector', () => {
    const sessionId = '01234567890123456789'

    expect(idToIv(sessionId).length).toBe(16)
  })

  test('same sessionId should generate same initialization vector', () => {
    const sessionId = '01234567890123456789'
    const iv1 = idToIv(sessionId)
    const iv2 = idToIv(sessionId)

    expect(iv1).toEqual(iv2)
  })

  test('different sessionId should generate different initialization vector', () => {
    const sessionId1 = '01234567890123456789'
    const sessionId2 = '98765432109876543210'
    const iv1 = idToIv(sessionId1)
    const iv2 = idToIv(sessionId2)

    expect(iv1).not.toEqual(iv2)
  })
})

describe('Cookie Session Parser', () => {
  let http: ReturnType<typeof Http>
  beforeEach(() => {
    http = Http()
  })
  test('should correctly encode and decode session information', async () => {
    const cookieParser = cookieSessionParser<string, string>({
      sessionInfoKey: 'test:key',
      cookieOptions: {
        maxAge: 1000,
        httpOnly: true,
      },
    })

    const sessionInfo = 'test-session-info'

    http.use(async () => {
      const response = await cookieParser.set(sessionInfo)
      return response.status(200)
    })

    const res = await request(http.handle).get('/').expect(200)

    const cookie = res.headers['set-cookie'][0]

    http.use(async (requestInfo) => {
      const parsedInfo = await cookieParser.get(requestInfo)
      expect(parsedInfo).toEqual(sessionInfo)
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').set('Cookie', cookie).expect(200)
  })

  test('should return null when cookie is not found', async () => {
    const cookieParser = cookieSessionParser<string, string>()
    http.use(async (requestInfo) => {
      const result = await cookieParser.get(requestInfo)
      expect(result).toBeNull()
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(200)
  })

  test('should return null when cookie content is not parsable', async () => {
    const cookieParser = cookieSessionParser<string, string>()
    http.use(async (requestInfo) => {
      const result = await cookieParser.get(requestInfo)
      expect(result).toBeNull()
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(200)
  })

  test('should correctly remove cookie', async () => {
    const cookieParser = cookieSessionParser<string, string>()
    http.use(async () => {
      const testSessionId = 'test-session-id'
      const response = await cookieParser.remove(testSessionId)
      return response.status(200)
    })
    const res = await request(http.handle).get('/').expect(200)
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toContain('expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  test('should support custom codec', async () => {
    const customCodec = {
      encode: (str: string) => Buffer.from(str).toString('hex'),
      decode: (str: string) => Buffer.from(str, 'hex').toString(),
    }

    const cookieParser = cookieSessionParser<string, string>({
      customCodec,
    })
    const sessionInfo = 'test-session-info'
    let sessionId = ''
    http.use(async () => {
      const response = await cookieParser.set(sessionInfo)
      sessionId = response.info?.cookies?.['sess:k']?.value as string
      return response.status(200)
    })
    await request(http.handle).get('/').expect(200)
    http.use(async (requestInfo) => {
      const parsedInfo = await cookieParser.get(requestInfo)
      expect(parsedInfo).toEqual(sessionInfo)
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').set('Cookie', `sess:k=${sessionId}`).expect(200)
  })
  test('should support custom sessionInfoKey', async () => {
    const cookieParser = cookieSessionParser<string, string>({
      sessionInfoKey: 'test:key',
    })
    const sessionCtx = createSessionCtx<{ userId: string }>({ userId: '' })
    http.use(
      createFarrowSession({
        sessionCtx,
        sessionParser: cookieParser,
        sessionStore: cookieSessionStore<{ userId: string }>({
          dataCreator: () => ({ userId: '123' }),
        }),
        autoSave: false,
      }),
    )
    http.use(async () => {
      const sessionData = sessionCtx.get()
      expect(sessionData).toEqual({ userId: '123' })
      return Response.json({ success: true })
    })
    const res = await request(http.handle).get('/').expect(200)
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toContain('test:key=')
  })
  test('should support expireTime in SessionInfo', async () => {
    const sessionCtx = createSessionCtx<{ userId: string }>({ userId: '' })
    const testSessionStore: SessionStore<{ userId: string }, string, { sessionId: string; expireTime: number }> = {
      get: async () => ({
        sessionMeta: { sessionId: '123', expireTime: 2 * 60 * 60 * 1000 },
        sessionData: { userId: '123' },
      }),
      set: async () => true,
      create: async () => ({
        sessionMeta: { sessionId: '123', expireTime: 2 * 60 * 60 * 1000 },
        sessionData: { userId: '123' },
      }),
      destroy: async () => true,
    }
    http.use(
      createFarrowSession<{ userId: string }, string, { sessionId: string; expireTime: string | number }>({
        sessionCtx,
        sessionParser: cookieSessionParser({
          sessionInfoKey: 'test:key',
        }),
        sessionStore: testSessionStore,
        autoSave: false,
      }),
    )
    http.use(async () => {
      const sessionData = sessionCtx.get()
      expect(sessionData).toEqual({ userId: '123' })
      return Response.json({ success: true })
    })
    const res = await request(http.handle).get('/').expect(200)
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toContain('test:key=')
    expect(cookie).toContain('expires=')
    const now = new Date()
    const newTime = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    expect(cookie).toContain(newTime.toUTCString())
  })
})
describe('Cookie Session Store', () => {
  let http: ReturnType<typeof Http>
  const sessionCtx = createSessionCtx<{ userId: string }>({ userId: '' })
  beforeEach(() => {
    http = Http()
  })
  test('should correctly create session in the store', async () => {
    const store = cookieSessionStore<{ userId: string }>({
      dataCreator: () => ({ userId: '123' }),
    })

    http.use(async (requestInfo) => {
      const result = await store.create(requestInfo)
      expect(result).toBeTruthy()
      expect(result?.sessionData).toEqual({ userId: '123' })
      expect(result?.sessionMeta).toBeDefined()
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(200)
  })
  test('should the store correctly create session in the middleware', async () => {
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieSessionParser<string, string>(),
      sessionStore: cookieSessionStore<{ userId: string }>({
        dataCreator: () => ({ userId: '123' }),
      }),
    })
    http.use(session)
    http.use(async () => {
      const sessionData = sessionCtx.get()
      expect(sessionData).toEqual({ userId: '123' })
      return Response.json({ success: true })
    })
    const res = await request(http.handle).get('/').expect(200)
    const cookies = res.headers['set-cookie']
    expect(cookies).toHaveLength(2)
    expect(cookies[1]).toContain('sess:s=')
  })
  test('should return null when session is not found', async () => {
    const store = cookieSessionStore<{ userId: string }>()
    http.use(async () => {
      const result = await store.get('123')
      expect(result).toBeNull()
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(200)
  })
  test('should correctly create,set session data', async () => {
    const store = cookieSessionStore<{ userId: string }>()
    http.use(
      createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: cookieSessionParser<string, string>(),
        sessionStore: store,
      }),
    )
    http.use(async (requestInfo) => {
      const createResult = await store.create(requestInfo, { userId: '123' })
      expect(createResult).toBeDefined()
      const setResult = await store.set(createResult!.sessionMeta, { userId: '456' })
      expect(setResult).toBe(true)
      return Response.json({ success: true })
    })
    const resp = await request(http.handle).get('/').expect(200)
    expect(resp.headers['set-cookie']).toHaveLength(2)
    expect(resp.headers['set-cookie'][1]).toContain('sess:s=')
  })
  test('should correctly get session data', async () => {
    const store = cookieSessionStore<{ userId: string }>({
      dataCreator: () => ({ userId: '123' }),
    })
    http.use(
      createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: cookieSessionParser<string, string>(),
        sessionStore: store,
      }),
    )
    http.use(async () => {
      const sessionData = sessionCtx.get()
      expect(sessionData).toEqual({ userId: '123' })
      return Response.json({ success: true })
    })
    const res = await request(http.handle).get('/').expect(200)
    const cookies = res.headers['set-cookie']
    expect(cookies).toHaveLength(2)
    expect(cookies[1]).toContain('sess:s=')
    await request(http.handle).get('/').set('Cookie', cookies[1]).set('Cookie', cookies[0]).expect(200)
  })
  test('should correctly destroy session', async () => {
    const store = cookieSessionStore<{ userId: string }>()
    let sessionMeta: string

    http.use(async (requestInfo) => {
      const createResult = await store.create(requestInfo)
      expect(createResult).toBeDefined()
      sessionMeta = createResult!.sessionMeta
      const result = await store.destroy(sessionMeta)
      expect(result).toBe(true)
      const sessionHeaders = sessionHeaderCtx.get()
      expect(sessionHeaders).toHaveLength(1)
      expect(sessionHeaders[0].info?.cookies?.['sess:s']?.value).toBe('')
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(200)
  })
})
