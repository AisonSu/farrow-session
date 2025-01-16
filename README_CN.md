# farrow-session

基于 [Farrow](https://github.com/farrow-js/farrow) 框架的会话中间件，提供灵活且解耦的会话管理功能。

[English](./README.md)

## 特性

- 🔌 解耦设计：分离解析器和存储实现
- 🛠 灵活配置：支持多个中间件实例
- 🔒 可定制安全性：支持自定义的认证授权机制
- 🍪 Cookie 支持：内置基于 Cookie 的解析器和存储实现
- 🎯 类型安全：完整的 TypeScript 类型支持

## 设计理念

虽然命名为 "farrow-session"，但本中间件采用了更加灵活的设计思路：

1. 解耦的信息流，关注点分离

   - SessionInfo: 客户端和服务器之间的交换信息（如 sessionId、accessToken、refreshToken）
   - SessionMeta: Parser 和 Store 之间的交换信息（如 sessionId、accessToken与过期时间）
   - SessionData: Store 和 Context（仅服务器端数据，如用户信息、权限信息） 之间的交换信息

2. 独立的组件设计

   - SessionParser: 处理信息的解析和响应设置
   - SessionStore: 管理会话存储和验证
   - SessionContext: 控制请求中的会话生命周期

3. 灵活的会话管理

   - 不内置过期管理机制，开发者可自定义过期管理逻辑
   - 可自定义会话验证逻辑
   - 支持多种认证场景（Session、JWT、OAuth 等）

4. 多中间件支持
   - 支持多个中间件实例，每个中间件实例可以有不同的配置和功能

这样的设计使得中间件能够适应各种认证场景和需求，例如：

- 传统的服务器端会话管理
- 基于 JWT 的身份验证和令牌续期
- OAuth2 流程中的刷新令牌处理
- 混合认证系统
- 无缝续期或会话动态有效期管理

## 类型定义

请参考 [session.ts](./src/session.ts) 和 [cookie.ts](./src/cookie.ts)中类型定义
和注释

## 安装

```bash
# npm
npm install @aisonren/farrow-session
# pnpm
pnpm add @aisonren/farrow-session
# yarn
yarn add @aisonren/farrow-session
```

## 使用说明

### 基础用法（使用 Cookie 实现）

```typescript
import { Http } from 'farrow-http'
import { createSessionCtx, cookieSessionParser, cookieSessionStore } from '@aisonren/farrow-session'

// 创建会话上下文
const sessionCtx = createSessionCtx<{ userId?: string }>({ userId: undefined })

// 创建会话解析器
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时，当parser.set接受的sessionMeta中expiresTime/expireTime存在时，会使用该值作为maxAge
    httpOnly: true,
  },
})

// 创建会话存储
const store = cookieSessionStore({
  sessionStoreKey: 'sess:store',
  expiresOptions: {
    rolling: true,
    time: 24 * 60 * 60 * 1000, // 24小时
  },
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
})

// 创建会话中间件
const session = createFarrowSession({
  sessionCtx,
  sessionParser: parser,
  sessionStore: store,
  autoSave: true,
})

// 在 Farrow 应用中使用
const http = Http()

http.use(session)
http.use(() => {
  // 获取会话数据
  const data = sessionCtx.get()

  // 设置会话数据
  sessionCtx.set({ userId: '123' })

  // 重新生成会话 ID
  await sessionCtx.regenerateId()

  // 销毁会话
  await sessionCtx.destroy()

  return Response.json({ success: true })
})
```

### 自定义cookieSessionParser编解码器

你可以为cookieSessionParser提供自定义的编解码器：

```typescript
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  customCodec: {
    encode: (plainSessionId: string) => {
      // 自定义编码逻辑
      return Buffer.from(plainSessionId).toString('base64')
    },
    decode: (encodedSessionId: string) => {
      // 自定义解码逻辑
      return Buffer.from(encodedSessionId, 'base64').toString('utf8')
    },
  },
})
```

### 自定义SessionStore

你可以为SessionStore提供自定义的存储实现：

```typescript
import { SessionStore } from '@aisonren/farrow-session'
import { Redis } from 'ioredis'

// Example: Redis-based session store
const redisSessionStore: SessionStore = {
  async create() {
    const sessionId = generateULID()
    const sessionData = {}
    await redis.set(sessionId, JSON.stringify(sessionData))
    return { sessionId, sessionData }
  },
  async get(sessionId) {
    const data = await redis.get(sessionId)
    return data ? JSON.parse(data) : undefined
  },
  async set(sessionId, data) {
    await redis.set(sessionId, JSON.stringify(data))
    return true
  },
  async destroy(sessionId) {
    await redis.del(sessionId)
    return true
  },
}
// Example: session store may need get and set the header
import { sessionHeaderCtx } from '@aisonren/farrow-session'
const cookieSessionStore: SessionStore = {
  //.....other code
  async get(sessionId: string) {
    const requestInfo = useRequestInfo()
    // ...other code
  },
  async set(sessionId, sessionData) {
    const sessionHeaders = sessionHeaderCtx.get()
    // ...other code
    sessionHeaderCtx.set([...sessionHeaders, Response.cookie(sessionId, sessionData)])
    // ...other code
  },
}
```

### 多会话中间件

你可以创建多个会话中间件实例用于不同目的：

```typescript
// 管理员会话（使用严格的安全措施）
const adminSession = createFarrowSession({
  sessionCtx: adminSessionCtx,
  sessionParser: headerSessionParser,
  sessionStore: redisSessionStore,
})

// 用户会话（使用基于 Cookie 的存储）
const userSession = createFarrowSession({
  sessionCtx: userSessionCtx,
  sessionParser: cookieSessionParser(/* ... */),
  sessionStore: cookieSessionStore(/* ... */),
})

// 应用到不同路由
http.use('/admin', adminSession)
http.use('/api', userSession)
```

## 安全性考虑

1. 内置的 `cookieSessionStore` 仅为方便开发提供，不建议在生产环境中用于存储敏感数据。建议使用专门的会话存储（如 Redis、MongoDB）以获得更好的安全性。

2. 中间件没有包含任何默认的解析器或存储实现。你必须根据安全需求明确选择和配置它们。

## 使用场景

1. **多租户应用**

   - 为不同租户使用不同的会话存储
   - 不同的会话过期策略，如：
     - 固定过期时间
     - 基于用户活动风险评估
   - 自定义会话数据结构

2. **混合认证系统**

   - 移动客户端使用 API 令牌
   - Web 客户端使用基于 Cookie 的会话
   - 第三方应用使用 OAuth 令牌

3. **微服务架构**

   - 分布式会话存储
   - 服务特定的会话配置
   - 跨服务会话共享

## License

MIT
