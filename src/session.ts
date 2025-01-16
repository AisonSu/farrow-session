import { MaybeAsyncResponse, RequestInfo, Response } from 'farrow-http'
import { Context, Middleware, createContext } from 'farrow-pipeline'

/**
 * SessionStore用于新建、获取或设置Session相关的数据内容，它验证从SessionParser中解析出的SessionInfo是否有效，并返回SessionMeta和SessionData
 * SessionStore is used to create, get or set session-related data content, it verifies whether the SessionInfo parsed from SessionParser is valid, and returns the SessionMeta and SessionData
 */
export type SessionStore<Data, Info, Meta> = {
  /**
   * 传入sessionInfo,如果该sessionInfo存在且有效,则返回[Meta,Data]，如果不存在，返回false，如果发生内部错误，返回undefined
   *
   * Input sessionInfo, if the sessionInfo exists and is valid, return the the tuple of sessionMeta and sessionData, otherwise return undefined
   *
   * @param sessionInfo
   */
  get(sessionInfo: Info): Promise<{ sessionMeta: Meta; sessionData: Data } | null | undefined>
  /**
   * 传入sessionId和sessionData,如果成功，返回true，如果失败，返回null，如果发生内部错误，返回undefined
   * Input sessionId and sessionData, if success, return true, if failed, return null, if internal error, return undefined
   *
   * @param sessionMeta
   * @param sessionData
   * @returns true | null | undefined
   */
  set(sessionMeta: Meta, sessionData: Data): Promise<true | null | undefined>
  /**
   * 传入request和可选参数sessionData,返回生成的sessionMeta和sessionData,如果失败,返回null，如果发生内部错误，返回undefined
   * Input request and sessionData, return the generated sessionMeta and sessionData, if failed, return null, if internal error, return undefined
   *
   * @param request
   * @param sessionData
   * @returns { sessionMeta: Meta; sessionData: Data } | null | undefined
   */
  create(request: RequestInfo, sessionData?: Data): Promise<{ sessionMeta: Meta; sessionData: Data } | null | undefined>
  /**
   * 传入sessionId，如果成功，返回true，如果失败，返回null，如果发生内部错误，返回undefined
   * Input sessionId, if success, return true, if failed, return null, if internal error, return undefined
   *
   * @param sessionMeta
   * @returns true | null | undefined
   */
  destroy(sessionMeta: Meta): Promise<true | null | undefined>
}

/**
 * SessionParser用于从RequestInfo中解析并返回SessionInfo，或者根据SessionMeta设置更新或删除SessionInfo的Response
 * SessionParser is used to parse sessionInfo from RequestInfo and return sessionInfo, or according to SessionMeta to update or delete SessionInfo in Response
 */
export type SessionParser<Info, Meta> = {
  /**
   * Get sessionInfo from RequestInfo
   * SessionInfo is the information of the session, it may contains sessionId, accessToken, refreshToken, etc.
   * @param request the Farrow RequestInfo
   * @returns sessionInfo, if not exist, return null
   *
   */
  get(request: RequestInfo): Promise<Info | null>
  /**
   * Update SessionMeta in Response according to Session
   * @param sessionMeta the SessionMeta to be updated
   * @returns Response the Response with updated SessionMeta need to merge into the total response
   */
  set(sessionMeta: Meta): Promise<Response>
  /**
   * Delete SessionMeta in Response according to Session
   * @param sessionMeta the SessionMeta to be deleted
   * @returns Response the Response with deleted SessionMeta need to merge into the total response
   */
  remove(sessionMeta: Meta): Promise<Response>
}

export type SessionConfig<D, I, M> = {
  sessionCtx: SessionCtx<D>
  autoSave: boolean
  sessionParser: SessionParser<I, M>
  sessionStore: SessionStore<D, I, M>
}
export type SessionCtx<D> = Context<D> & {
  /**
   * Save the session to the store,if success,return true, if session is not exist,return false,if the store failed,return null,if the store happend internal error,return undefined
   * @returns true | null | undefined
   */
  saveToStore: () => Promise<boolean | null | undefined>
  /**
   * Regenerate the sessionId,if success,return true, if session is not exist,return false,if the store failed,return null,if the store happend internal error,return undefined
   * @returns true | false | null | undefined
   */
  regenerateId: () => Promise<boolean | null | undefined>
  /**
   * Destroy the session,if success,return true, if session is not exist,return false,if the store failed,return null,if the store happend internal error,return undefined
   * @returns true | false | null | undefined
   */
  destroy: () => Promise<boolean | null | undefined>
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
export const createFarrowSession = <D, I, M>(
  config: SessionConfig<D, I, M>,
): Middleware<RequestInfo, MaybeAsyncResponse> => {
  const sessionMetaCtx = createContext<M | undefined>(undefined)
  const { sessionParser, sessionStore, autoSave, sessionCtx } = config
  const middleware: Middleware<RequestInfo, MaybeAsyncResponse> = async (request, next) => {
    // 从RequestInfo中解析获取sessionInfo，并设置到sessionIdCtx中
    const unverifiedSessionInfo = await sessionParser.get(request)
    // 如果sessionInfo不存在，则创建新的session
    if (!unverifiedSessionInfo) {
      const createResult = await sessionStore.create(request)
      if (!createResult) return Response.json({ error: 'Internal Server Error' }).status(500)
      const { sessionMeta, sessionData } = createResult
      sessionMetaCtx.set(sessionMeta)
      sessionCtx.set(sessionData)
      const sessionHeader = await sessionParser.set(sessionMeta)
      sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
    } else {
      const verifiedResult = await sessionStore.get(unverifiedSessionInfo)
      // if get sessionData failed with undefined,means internal error,return 500 error
      if (verifiedResult === undefined) return Response.json({ error: 'Internal Server Error' }).status(500)

      // if get sessionData failed with false,means sessionId invalid,create new session
      if (verifiedResult === null) {
        const createResult = await sessionStore.create(request)
        if (!createResult) return Response.json({ error: 'Internal Server Error' }).status(500)
        const { sessionMeta, sessionData } = createResult
        sessionMetaCtx.set(sessionMeta)
        sessionCtx.set(sessionData)
        const sessionHeader = await sessionParser.set(sessionMeta)
        sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
      } else {
        // if get sessionData success,means sessionId valid,set sessionData to sessionCtx
        const { sessionMeta, sessionData } = verifiedResult
        sessionMetaCtx.set(sessionMeta)
        sessionCtx.set(sessionData)
      }
    }

    // define the sessionCtx functions
    sessionCtx.regenerateId = async () => {
      const session = sessionCtx.get()
      if (session === undefined) return false
      const createResult = await sessionStore.create(request, session)
      if (!createResult) return createResult
      const { sessionMeta } = createResult
      sessionMetaCtx.set(sessionMeta)
      const sessionHeader = await sessionParser.set(sessionMeta)
      sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
      return true
    }

    sessionCtx.destroy = async () => {
      const sessionMeta = sessionMetaCtx.get()
      if (sessionMeta === undefined) return false
      const destroyResult = await sessionStore.destroy(sessionMeta)
      if (!destroyResult) return destroyResult
      sessionMetaCtx.set(undefined)
      const sessionHeader = await sessionParser.remove(sessionMeta)
      sessionHeaderCtx.set([...sessionHeaderCtx.get(), sessionHeader])
      return true
    }

    sessionCtx.saveToStore = async () => {
      const sessionMeta = sessionMetaCtx.get()
      if (sessionMeta === undefined) return false
      const setResult = await sessionStore.set(sessionMeta, sessionCtx.get())
      if (setResult !== true) return setResult
      return true
    }

    const response = await next()

    const sessionMeta = sessionMetaCtx.get()
    if (autoSave && sessionMeta) {
      const setResult = await sessionStore.set(sessionMeta, sessionCtx.get())
      if (setResult === undefined) return Response.json({ error: 'Internal Server Error' }).status(500)
      if (setResult === null) return Response.json({ error: 'SessionStore Set Failed' }).status(401)
    }
    const sessionHeaders = sessionHeaderCtx.get()
    return Response.merge(...sessionHeaders).merge(response)
  }

  return middleware
}
export const session = createFarrowSession
