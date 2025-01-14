import { createSessionCtx, createFarrowSession, SessionParser, SessionStore } from '../src/session'
import { Response, Http } from 'farrow-http'
import type { RequestInfo } from 'farrow-http'
import request from 'supertest'

describe('createSessionCtx', () => {
  let http: ReturnType<typeof Http>

  beforeEach(() => {
    http = Http()
  })

  test('should create session context with default data', async () => {
    const defaultData = { userId: '123' }
    const sessionCtx = createSessionCtx(defaultData)

    http.use(() => {
      expect(sessionCtx.get()).toEqual(defaultData)
      expect(typeof sessionCtx.saveToStore).toBe('function')
      expect(typeof sessionCtx.regenerateId).toBe('function')
      expect(typeof sessionCtx.destroy).toBe('function')
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(200)
  })

  test('should throw error when calling unimplemented methods', async () => {
    const sessionCtx = createSessionCtx({})

    http.use(async () => {
      await expect(sessionCtx.saveToStore()).rejects.toThrow('saveToStore is not implemented yet')
      await expect(sessionCtx.regenerateId()).rejects.toThrow('regenerateId is not implemented yet')
      await expect(sessionCtx.destroy()).rejects.toThrow('destroy is not implemented yet')
      return Response.json({ success: true })
    })

    await request(http.handle).get('/').expect(200)
  })
})

describe('createFarrowSession', () => {
  const mockSessionParser: SessionParser = {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  }

  const mockSessionStore: SessionStore<{ userId?: string }> = {
    get: jest.fn(),
    set: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  }

  const defaultData: { userId?: string } = { userId: undefined }
  const sessionCtx = createSessionCtx<{ userId?: string }>(defaultData)
  let http: ReturnType<typeof Http>

  beforeEach(() => {
    jest.clearAllMocks()
    http = Http()
    ;(mockSessionParser.set as jest.Mock).mockResolvedValue(Response.json({ success: true }))
    ;(mockSessionParser.remove as jest.Mock).mockResolvedValue(Response.json({ success: true }))
  })

  describe('session initialization', () => {
    test('should create new session when sessionId not exists', async () => {
      const newSession = { sessionId: 'new-session', sessionData: { userId: '123' } }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue(undefined)
      ;(mockSessionStore.create as jest.Mock).mockResolvedValue(newSession)
      ;(mockSessionParser.set as jest.Mock).mockResolvedValue(Response.json({ success: true }))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let sessionData: { userId?: string } | undefined

      http.use(session)
      http.use(() => {
        sessionData = sessionCtx.get()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionParser.get).toHaveBeenCalled()
      expect(mockSessionStore.create).toHaveBeenCalled()
      expect(sessionData).toEqual(newSession.sessionData)
    })

    test('should handle session creation failure', async () => {
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue(undefined)
      ;(mockSessionStore.create as jest.Mock).mockRejectedValue(new Error('Creation failed'))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let error: Error | undefined

      http.use(session)
      http.use(() => {
        try {
          return Response.json({ success: true })
        } catch (e) {
          error = e as Error
          return Response.json({ error: error.message }).status(500)
        }
      })

      await request(http.handle).get('/').expect(500)

      expect(mockSessionParser.get).toHaveBeenCalled()
      expect(mockSessionStore.create).toHaveBeenCalled()
    })
  })

  describe('session operations', () => {
    test('should load existing session when sessionId exists and valid', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let sessionData: { userId?: string } | undefined

      http.use(session)
      http.use(() => {
        sessionData = sessionCtx.get()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionParser.get).toHaveBeenCalled()
      expect(mockSessionStore.get).toHaveBeenCalledWith('existing-session')
      expect(sessionData).toEqual(existingSession)
    })

    test('should handle session loading failure', async () => {
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockRejectedValue(new Error('Loading failed'))
      ;(mockSessionStore.create as jest.Mock).mockResolvedValue({
        sessionId: 'new-session',
        sessionData: defaultData,
      })

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let error: Error | undefined

      http.use(session)
      http.use(() => {
        try {
          return Response.json({ success: true })
        } catch (e) {
          error = e as Error
          return Response.json({ error: error.message }).status(500)
        }
      })

      await request(http.handle).get('/').expect(500)

      expect(mockSessionParser.get).toHaveBeenCalled()
      expect(mockSessionStore.get).toHaveBeenCalled()
    })

    test('should create new session when sessionId exists but invalid', async () => {
      const newSession = { sessionId: 'new-session', sessionData: { userId: '789' } }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('invalid-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(undefined)
      ;(mockSessionStore.create as jest.Mock).mockResolvedValue(newSession)

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let sessionData: { userId?: string } | undefined

      http.use(session)
      http.use(() => {
        sessionData = sessionCtx.get()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionParser.get).toHaveBeenCalled()
      expect(mockSessionStore.get).toHaveBeenCalledWith('invalid-session')
      expect(mockSessionStore.create).toHaveBeenCalled()
      expect(sessionData).toEqual(newSession.sessionData)
    })
  })

  describe('session saving', () => {
    test('should auto save session data when autoSave is true', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      http.use(session)
      http.use(() => {
        sessionCtx.set({ userId: '999' })
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionStore.set).toHaveBeenCalledWith('existing-session', { userId: '999' })
    })

    test('should handle auto save failure', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)
      ;(mockSessionStore.set as jest.Mock).mockRejectedValue(new Error('Save failed'))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      let currentData: { userId?: string } | undefined

      http.use(session)
      http.use(() => {
        sessionCtx.set({ userId: '999' })
        currentData = sessionCtx.get()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(500)

      expect(mockSessionStore.set).toHaveBeenCalled()
      expect(currentData).toEqual({ userId: '999' })
    })

    test('should not auto save session data when autoSave is false', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)

      const session = createFarrowSession({
        sessionCtx,
        autoSave: false,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      http.use(session)
      http.use(() => {
        sessionCtx.set({ userId: '999' })
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionStore.set).not.toHaveBeenCalled()
    })
  })

  describe('session context methods', () => {
    test('should save session data manually', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)
      ;(mockSessionStore.set as jest.Mock).mockResolvedValue(true)
      ;(mockSessionParser.set as jest.Mock).mockResolvedValue(Response.json({ success: true }))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: false,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      http.use(session)
      http.use(async () => {
        sessionCtx.set({ userId: '999' })
        await sessionCtx.saveToStore()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionStore.set).toHaveBeenCalledWith('existing-session', { userId: '999' })
    })

    test('should regenerate session ID', async () => {
      const existingSession = { userId: '456' }
      const newSession = { sessionId: 'regenerated-session', sessionData: existingSession }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)
      ;(mockSessionStore.create as jest.Mock).mockResolvedValue(newSession)
      ;(mockSessionParser.set as jest.Mock).mockResolvedValue(Response.json({ success: true }))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      http.use(session)
      http.use(async () => {
        await sessionCtx.regenerateId()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionStore.create).toHaveBeenCalled()
      expect(mockSessionParser.set).toHaveBeenCalledWith(newSession.sessionId)
    })

    test('should destroy session', async () => {
      const existingSession = { userId: '456' }
      ;(mockSessionParser.get as jest.Mock).mockResolvedValue('existing-session')
      ;(mockSessionStore.get as jest.Mock).mockResolvedValue(existingSession)
      ;(mockSessionStore.destroy as jest.Mock).mockResolvedValue(true)
      ;(mockSessionParser.remove as jest.Mock).mockResolvedValue(Response.json({ success: true }))

      const session = createFarrowSession({
        sessionCtx,
        autoSave: true,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
      })

      http.use(session)
      http.use(async () => {
        await sessionCtx.destroy()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)

      expect(mockSessionStore.destroy).toHaveBeenCalledWith('existing-session')
      expect(mockSessionParser.remove).toHaveBeenCalledWith('existing-session')
    })
  })

  describe('error handling', () => {
    test('should handle session context method errors', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockRejectedValue(new Error('Set failed')),
        remove: jest.fn().mockRejectedValue(new Error('Remove failed')),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockRejectedValue(new Error('Store set failed')),
        destroy: jest.fn().mockRejectedValue(new Error('Store destroy failed')),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        // 测试 saveToStore 失败
        const saveResult = await sessionCtx.saveToStore()
        expect(saveResult).toBe(false)

        // 测试 regenerateId 失败
        const regenerateResult = await sessionCtx.regenerateId()
        expect(regenerateResult).toBe(false)

        // 测试 destroy 失败
        const destroyResult = await sessionCtx.destroy()
        expect(destroyResult).toBe(false)

        return Response.json({ success: true })
      })

      await request(http.handle).get('/')
    })

    test('should handle session header merging', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(Response.json({ header: 'set' })),
        remove: jest.fn().mockResolvedValue(Response.json({ header: 'removed' })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        // 测试响应头合并
        await sessionCtx.regenerateId()
        await sessionCtx.destroy()
        return Response.json({ success: true })
      })

      const response = await request(http.handle).get('/')
      expect(response.status).toBe(200)
    })

    test('should handle session parser errors', async () => {
      const mockSessionParser = {
        get: jest.fn().mockRejectedValue(new Error('Parser error')),
        set: jest.fn().mockResolvedValue(Response.json({ success: true })),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(() => Response.json({ success: true }))

      await request(http.handle).get('/').expect(500)
    })

    test('should handle multiple session operations', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(Response.json({ success: true })),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({ userId: '123' }),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        // 测试多个会话操作的组合
        await sessionCtx.regenerateId()
        sessionCtx.set({ userId: '456' })
        await sessionCtx.saveToStore()
        await sessionCtx.destroy()
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)
      expect(mockSessionStore.set).toHaveBeenCalled()
      expect(mockSessionStore.destroy).toHaveBeenCalled()
    })

    test('should handle response merging with custom headers', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(
          Response.json({ success: true }).headers({
            'X-Custom-Header': 'test',
          }),
        ),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({ userId: '123' }),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        await sessionCtx.regenerateId()
        return Response.json({ success: true }).headers({
          'X-Another-Header': 'test2',
        })
      })

      const response = await request(http.handle).get('/')
      expect(response.status).toBe(200)
      expect(response.headers['x-custom-header']).toBe('test')
      expect(response.headers['x-another-header']).toBe('test2')
    })
  })

  describe('response merging', () => {
    test('should merge multiple response headers', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(
          Response.json({ success: true }).headers({
            'X-Session-Header': 'test',
            'X-Custom-Header': 'value1',
          }),
        ),
        remove: jest.fn().mockResolvedValue(
          Response.json({ success: true }).headers({
            'X-Custom-Header': 'value2',
          }),
        ),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        await sessionCtx.regenerateId()
        await sessionCtx.destroy()
        return Response.json({ success: true }).headers({
          'X-App-Header': 'app-value',
        })
      })

      const response = await request(http.handle).get('/')
      expect(response.status).toBe(200)
      expect(response.headers['x-session-header']).toBe('test')
      expect(response.headers['x-custom-header']).toBe('value2')
      expect(response.headers['x-app-header']).toBe('app-value')
    })

    test('should handle response merging with status codes', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(Response.json({ success: true }).status(202)),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        await sessionCtx.regenerateId()
        return Response.json({ success: true }).status(202)
      })

      const response = await request(http.handle).get('/')
      expect(response.status).toBe(202)
    })
  })

  describe('error handling edge cases', () => {
    test('should handle undefined session data in store', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(Response.json({ success: true })),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(() => {
        const data = sessionCtx.get()
        expect(data).toEqual({})
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)
    })

    test('should handle concurrent session operations', async () => {
      const mockSessionParser = {
        get: jest.fn().mockResolvedValue('test-session-id'),
        set: jest.fn().mockResolvedValue(Response.json({ success: true })),
        remove: jest.fn().mockResolvedValue(Response.json({ success: true })),
      }

      const mockSessionStore = {
        create: jest.fn().mockResolvedValue({ sessionId: 'test-session-id', sessionData: {} }),
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true),
      }

      const sessionCtx = createSessionCtx({})
      const middleware = createFarrowSession({
        sessionCtx,
        sessionParser: mockSessionParser,
        sessionStore: mockSessionStore,
        autoSave: true,
      })

      http.use(middleware)
      http.use(async () => {
        // 模拟并发操作
        const operations = [sessionCtx.regenerateId(), sessionCtx.saveToStore(), sessionCtx.destroy()]
        await Promise.all(operations)
        return Response.json({ success: true })
      })

      await request(http.handle).get('/').expect(200)
    })
  })
})
