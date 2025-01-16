import { describe, test, expect, beforeEach } from '@jest/globals'
import { createFarrowSession, createSessionCtx, SessionStore } from '../src/session'
import { Http, Response } from 'farrow-http'
import request from 'supertest'
import { cookieSessionStore, cookieSessionParser } from '../src/cookie'
const cookieParser = cookieSessionParser<string, string>()
const cookieStore = cookieSessionStore<{ userId: string }>()
const sessionCtx = createSessionCtx({ userId: '123' })
describe('Session Context', () => {
  let http: ReturnType<typeof Http>
  beforeEach(() => {
    http = Http()
  })
  const session = createFarrowSession({
    sessionCtx,
    autoSave: true,
    sessionParser: cookieParser,
    sessionStore: cookieStore,
  })
  test('should throw error when not pass into session middleware', async () => {
    http.use(async () => {
      await expect(sessionCtx.saveToStore()).rejects.toThrow(
        'saveToStore is not implemented yet,You need pass the session function to the middleware to create it ',
      )
      await expect(sessionCtx.regenerateId()).rejects.toThrow(
        'regenerateId is not implemented yet,You need pass the session function to the middleware to create it ',
      )
      await expect(sessionCtx.destroy()).rejects.toThrow(
        'destroy is not implemented yet,You need pass the session function to the middleware to create it ',
      )
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(200)
  })
  test('should works normally when using session middleware and session is found', async () => {
    http.use(session)
    http.use(async () => {
      const session = sessionCtx.get()
      expect(await sessionCtx.saveToStore()).toEqual(true)
      expect(await sessionCtx.regenerateId()).toEqual(true)
      expect(await sessionCtx.destroy()).toEqual(true)
      return Response.json({ success: true, session })
    })
    await request(http.handle).get('/').expect(200)
  })
  test('should fail when using session middleware and session is not found', async () => {
    http.use(session)
    http.use(async () => {
      sessionCtx.destroy()
      expect(await sessionCtx.saveToStore()).toEqual(false)
      expect(await sessionCtx.regenerateId()).toEqual(false)
      expect(await sessionCtx.destroy()).toEqual(false)
      return Response.json({ success: true })
    })
    await request(http.handle).get('/').expect(500)
  })
})
describe('Session Store', () => {
  test('should return 500 when create method of session store is broken', async () => {
    const brokenCreateStore: SessionStore<{ userId: string }, string, string> = {
      async get(info: string) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return true
      },
      async create() {
        return undefined
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieParser,
      sessionStore: brokenCreateStore,
    })

    http.use(session)
    http.use(async () => {
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(500)
  })

  test('should return 500 when get method of session store is broken', async () => {
    const brokenGetStore: SessionStore<{ userId: string }, string, string> = {
      async get() {
        return undefined
      },
      async set() {
        return true
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieParser,
      sessionStore: brokenGetStore,
    })

    http.use(session)
    http.use(async () => {
      return Response.json({ success: true })
    })

    // 第一次访问创建session
    const firstResponse = await request(http.handle).get('/')
    expect(firstResponse.status).toBe(200)

    // 第二次访问时get方法故障
    const cookie = firstResponse.headers['set-cookie']
    await request(http.handle).get('/').set('Cookie', cookie).expect(500)
  })

  test('should return 500 when destroy method of session store is broken', async () => {
    const brokenDestroyStore: SessionStore<{ userId: string }, string, string> = {
      async get(info: string) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return true
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return undefined
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieParser,
      sessionStore: brokenDestroyStore,
    })

    http.use(session)
    http.use(async () => {
      const destroyResult = await sessionCtx.destroy()
      expect(destroyResult).toEqual(undefined)
      if (destroyResult === undefined) {
        return Response.json({ error: 'Internal Server Error' }).status(500)
      }
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(500)
  })
  test('should return 500 when set method of session store is broken', async () => {
    const brokenSetStore: SessionStore<{ userId: string }, string, string> = {
      async get(info: string) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return undefined
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieParser,
      sessionStore: brokenSetStore,
    })

    http.use(session)
    http.use(async () => {
      const saveResult = await sessionCtx.saveToStore()
      expect(saveResult).toEqual(undefined)
      if (saveResult === undefined) {
        return Response.json({ error: 'Internal Server Error' }).status(500)
      }
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(500)
  })

  test('should return 500 when session store get operation failed', async () => {
    const failedGetStore: SessionStore<{ userId: string }, string, string> = {
      async get() {
        return undefined
      },
      async set() {
        return true
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieSessionParser(),
      sessionStore: failedGetStore,
    })

    http.use(session)
    http.use(async () => {
      return Response.json({ success: true })
    })
    const firstResponse = await request(http.handle).get('/').expect(200)
    const cookie = firstResponse.headers['set-cookie']
    await request(http.handle).get('/').set('Cookie', cookie).expect(500)
  })

  test('should return 500 when session store set operation failed', async () => {
    const failedSetStore: SessionStore<{ userId: string }, string, string> = {
      async get(info) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return undefined
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieParser,
      sessionStore: failedSetStore,
    })

    http.use(session)
    http.use(async () => {
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(500)
  })

  test('should return 500 when session store create operation failed', async () => {
    const failedCreateStore: SessionStore<{ userId: string }, string, string> = {
      async get(info) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return true
      },
      async create() {
        return null
      },
      async destroy() {
        return true
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieSessionParser(),
      sessionStore: failedCreateStore,
    })

    http.use(session)
    http.use(async () => {
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(500)
  })

  test('should return 500 when session store destroy operation failed', async () => {
    const failedDestroyStore: SessionStore<{ userId: string }, string, string> = {
      async get(info) {
        return { sessionMeta: info, sessionData: { userId: '123' } }
      },
      async set() {
        return true
      },
      async create() {
        return { sessionMeta: 'test', sessionData: { userId: '123' } }
      },
      async destroy() {
        return undefined
      },
    }

    const http = Http()
    const sessionCtx = createSessionCtx({ userId: '123' })
    const session = createFarrowSession({
      sessionCtx,
      autoSave: true,
      sessionParser: cookieSessionParser(),
      sessionStore: failedDestroyStore,
    })

    http.use(session)
    http.use(async () => {
      const destroyResult = await sessionCtx.destroy()
      expect(destroyResult).toEqual(undefined)
      return Response.json({ success: true })
    })
  })
})
