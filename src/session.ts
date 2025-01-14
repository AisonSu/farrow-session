import { MaybeAsyncResponse, RequestInfo, Response } from 'farrow-http'
import { Context, Middleware, createContext } from 'farrow-pipeline'

/**
 * SessionStore用于新建、获取或设置Session相关的数据内容
 * SessionStore is used to create, get or set session-related data content
 */
export type SessionStore<D> = {
  /**
   * 传入sessionId,如果该sessionId存在且有效,则返回Session<D>，否则返回undefined
   *
   * Input sessionId, if the sessionId exists and is valid, return the Session<D>, otherwise return undefined.
   *
   * @param sessionId
   */
  get(sessionId: string): Promise<D | undefined>
  /**
   * 传入session,如果需要更新元数据（SessionId或者过期时间）则返回Session<D>，否则返回undefined
   *
   * Input session, if the session exists, update the metadata (SessionId or expiration time etc.) and return the Session<D>, otherwise return undefined.
   *
   * @param sessionId
   * @param sessionData
   */
  set(sessionId: string, sessionData: D): Promise<boolean>
  /**
   * 传入sessionId和Data,返回生成的session
   *
   * Input sessionId and sessionData, return the generated session.
   */
  create(): Promise<{ sessionId: string; sessionData: D } | false>
  /**
   * 传入sessionId，返回是否成功删除session
   *
   * Input sessionId, return whether the session is successfully deleted.
   */
  destroy(sessionId: string): Promise<boolean>
}

/**
 * SessionParser用于从RequestInfo中(自定义请求头/cookie)解析并返回sessionId，或者根据Session设置更新或删除SessionId的Response
 * SessionParser is used to parse sessionId from RequestInfo (custom request header/cookie) and return sessionId, or according to Session to update or delete SessionId in Response
 */
export type SessionParser = {
  /**
   * Get sessionId from RequestInfo 从RequestInfo中解析获取sessionId
   * @param request the Farrow RequestInfo Farrow框架的请求信息
   * @returns sessionId, if not exist, return undefined 返回sessionId,如果不存在则返回undefined
   *
   */
  get(request: RequestInfo): Promise<string | undefined>
  /**
   * Update SessionId in Response according to Session
   * @param sessionId the SessionId to be updated
   * @returns Response the Response with updated SessionId need to merge into the total response
   */
  set(sessionId: string): Promise<Response>
  /**
   * Delete SessionId in Response according to Session
   * @param sessionId the SessionId to be deleted
   * @returns Response the Response with deleted SessionId need to merge into the total response
   */
  remove(sessionId: string): Promise<Response>
}

export type SessionConfig<D> = {
  sessionCtx: SessionCtx<D>
  autoSave: boolean
  sessionParser: SessionParser
  sessionStore: SessionStore<D>
}
export type SessionCtx<D> = Context<D> & {
  saveToStore: () => Promise<boolean>
  regenerateId: () => Promise<boolean>
  destroy: () => Promise<boolean>
}
export const createSessionCtx = <D>(defaultData: D): SessionCtx<D> => {
  const ctx = createContext<D>(defaultData)
  return {
    ...ctx,
    saveToStore: async () => {
      throw new Error(
        'saveToStore is not implemented yet,You need pass the session function to the middleware to create it ',
      )
    },
    regenerateId: async () => {
      throw new Error(
        'regenerateId is not implemented yet,You need pass the session function to the middleware to create it ',
      )
    },
    destroy: async () => {
      throw new Error(
        'destroy is not implemented yet,You need pass the session function to the middleware to create it ',
      )
    },
  }
}
export const sessionHeaderCtx = createContext<Response[]>([])
const sessionIdCtx = createContext<string | undefined>(undefined)
export const createFarrowSession = <D>(config: SessionConfig<D>): Middleware<RequestInfo, MaybeAsyncResponse> => {
  const { sessionParser, sessionStore, autoSave, sessionCtx } = config
  const middleware: Middleware<RequestInfo, MaybeAsyncResponse> = async (request, next) => {
    // 从RequestInfo中解析获取sessionId，并设置到sessionIdCtx中
    const sessionString = await sessionParser.get(request)
    // 如果sessionId不存在，则创建新的session
    if (!sessionString) {
      const createResult = await sessionStore.create()
      if (!createResult) return Response.json({ error: 'Internal Server Error' }).status(500)
      const { sessionId, sessionData } = createResult
      sessionIdCtx.set(sessionId)
      sessionCtx.set(sessionData)
      const sessionHeader = await sessionParser.set(sessionId)
      sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
    } else {
      // 如果sessionId存在，则从sessionStore中获取sessionData，并设置到sessionCtx中
      const sessionId = sessionString
      const sessionData = await sessionStore.get(sessionId)
      // 如果sessionData存在，说明sessionId有效，则设置到sessionCtx中
      if (sessionData) {
        sessionIdCtx.set(sessionId)
        sessionCtx.set(sessionData)
      } else {
        // 如果sessionData不存在，说明sessionId无效，则创建新的session
        const createResult = await sessionStore.create()
        if (!createResult) return Response.json({ error: 'Internal Server Error' }).status(500)
        const { sessionId, sessionData } = createResult
        sessionIdCtx.set(sessionId)
        sessionCtx.set(sessionData)
        const sessionHeader = await sessionParser.set(sessionId)
        sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
      }
    }
    const response = await next()

    if (autoSave && sessionIdCtx.get()) {
      await sessionStore.set(sessionIdCtx.get()!, sessionCtx.get())
    }

    const sessionHeaders = sessionHeaderCtx.get()
    return response.merge(...sessionHeaders)
  }

  sessionCtx.regenerateId = async () => {
    const session = sessionCtx.get()
    if (session === undefined) return false
    const createResult = await sessionStore.create()
    if (!createResult) return false
    const { sessionId } = createResult
    sessionIdCtx.set(sessionId)
    const sessionHeader = await sessionParser.set(sessionId)
    sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
    return true
  }

  sessionCtx.destroy = async () => {
    const sessionId = sessionIdCtx.get()
    if (sessionId === undefined) return false
    const destroyResult = await sessionStore.destroy(sessionId)
    if (!destroyResult) return false
    sessionIdCtx.set(undefined)
    const sessionHeader = await sessionParser.remove(sessionId)
    sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
    return true
  }

  sessionCtx.saveToStore = async () => {
    const sessionId = sessionIdCtx.get()
    if (sessionId === undefined) return false
    return await sessionStore.set(sessionId, sessionCtx.get())
  }

  return middleware
}
export const session = createFarrowSession
