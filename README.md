# farrow-session

[English](#english) | [中文](#中文)

<a id="english"></a>

A session middleware for [Farrow](https://github.com/farrow-js/farrow) framework, providing flexible and decoupled session management.

## Features

- 🔌 Decoupled Design: Separate session parser and store implementations
- 🛠 Flexible Configuration: Support multiple session middleware instances
- 🔒 Customizable Security: Choose your own session storage solution
- 🍪 Cookie Support: Built-in cookie-based session implementation
- 🎯 Type Safety: Complete TypeScript type support

## Installation

```bash
# pnpm
pnpm add farrow-session

# npm
npm install farrow-session

# yarn
yarn add farrow-session
```

## Architecture

The middleware is designed with a clear separation of concerns:

1. **Session Parser**: Responsible for getting/setting session IDs from/to requests
2. **Session Store**: Handles session data storage and retrieval
3. **Session Context**: Manages session state within request lifecycle

This decoupled design allows you to:

- Implement custom session ID retrieval methods (e.g., from headers instead of cookies)
- Use different storage solutions based on your security requirements
- Create multiple session middleware instances with different configurations

## Usage

### Basic Usage with Cookie Implementation

```typescript
import { Http } from 'farrow-http'
import { createSessionCtx, cookieSessionParser, cookieSessionStore } from 'farrow-session'

// Create session context
const sessionCtx = createSessionCtx<{ userId?: string }>({ userId: undefined })

// Create session parser (cookie-based)
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
})

// Create session store (cookie-based)
const store = cookieSessionStore({
  sessionStoreKey: 'your-secret-key',
  expiresOptions: {
    rolling: true,
    time: 24 * 60 * 60 * 1000,
  },
})

// Create session middleware
const session = createFarrowSession({
  sessionCtx,
  sessionParser: parser,
  sessionStore: store,
  autoSave: true,
})

// Use in Farrow application
const http = Http()
http.use(session)
```

### Custom Session Parser

You can implement your own session parser to get/set session IDs from different sources:

```typescript
import { SessionParser } from 'farrow-session'

// Example: Header-based session parser
const headerSessionParser: SessionParser = {
  get: async (requestInfo) => {
    return requestInfo.headers['x-session-id']
  },
  set: async (sessionId) => {
    return Response.json({ success: true }).headers({
      'x-session-id': sessionId,
    })
  },
  remove: async () => {
    return Response.json({ success: true }).headers({
      'x-session-id': '',
    })
  },
}
```

### Custom Session Store

For better security, you should implement your own session store using a database:

```typescript
import { SessionStore } from 'farrow-session'
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
```

### Multiple Session Middleware

You can create multiple session middleware instances for different purposes:

```typescript
// Admin session with strict security
const adminSession = createFarrowSession({
  sessionCtx: adminSessionCtx,
  sessionParser: headerSessionParser,
  sessionStore: redisSessionStore,
})

// User session with cookie-based storage
const userSession = createFarrowSession({
  sessionCtx: userSessionCtx,
  sessionParser: cookieSessionParser(/* ... */),
  sessionStore: cookieSessionStore(/* ... */),
})

// Apply to different routes
http.use('/admin', adminSession)
http.use('/api', userSession)
```

## Security Considerations

1. The built-in `cookieSessionStore` is provided for convenience but is not recommended for production use with sensitive data. Consider using a dedicated session store (e.g., Redis, MongoDB) for better security.

2. The middleware does not include any default parser or store implementations. You must explicitly choose and configure them based on your security requirements.

3. When using custom implementations:
   - Use secure communication channels (HTTPS)
   - Implement proper session ID generation
   - Consider session fixation attacks
   - Handle session expiration properly

## Use Cases

1. **Multi-tenant Applications**

   - Different session stores for different tenants
   - Varying session expiration policies
   - Custom session data structures

2. **Mixed Authentication Systems**

   - API tokens for mobile clients
   - Cookie-based sessions for web clients
   - OAuth tokens for third-party applications

3. **Microservices Architecture**
   - Distributed session storage
   - Service-specific session configurations
   - Cross-service session sharing

---

<a id="中文"></a>

# farrow-session

基于 [Farrow](https://github.com/farrow-js/farrow) 框架的会话中间件，提供灵活且解耦的会话管理功能。

## 特性

- 🔌 解耦设计：分离会话解析器和存储实现
- 🛠 灵活配置：支持多个会话中间件实例
- 🔒 可定制安全性：选择自己的会话存储方案
- 🍪 Cookie 支持：内置基于 Cookie 的会话实现
- 🎯 类型安全：完整的 TypeScript 类型支持

## 架构设计

中间件采用清晰的关注点分离设计：

1. **会话解析器**：负责从请求中获取/设置会话 ID
2. **会话存储**：处理会话数据的存储和检索
3. **会话上下文**：管理请求生命周期内的会话状态

这种解耦设计允许你：

- 实现自定义的会话 ID 获取方法（例如从请求头而不是 cookie）
- 根据安全需求使用不同的存储方案
- 创建具有不同配置的多个会话中间件实例

## 安装

```bash
# pnpm
pnpm add farrow-session

# npm
npm install farrow-session

# yarn
yarn add farrow-session
```

## 使用说明

### 基础用法（使用 Cookie 实现）

```typescript
import { Http } from 'farrow-http'
import { createSessionCtx, cookieSessionParser, cookieSessionStore } from 'farrow-session'

// 创建会话上下文
const sessionCtx = createSessionCtx<{ userId?: string }>({ userId: undefined })

// 创建会话解析器
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时
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

### 自定义会话解析器

你可以为会话 ID 提供自定义的编解码器：

```typescript
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  customCodec: {
    encode: (plainSessionId: string) => {
      // 自定义编码逻辑
      return encode(plainSessionId)
    },
    decode: (encodedSessionId: string) => {
      // 自定义解码逻辑
      return decode(encodedSessionId)
    },
  },
})
```

### 自定义会话存储

你可以为会话数据提供自定义的存储方案：

```typescript
import { SessionStore } from 'farrow-session'
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

3. 使用自定义实现时的注意事项：
   - 使用安全的通信通道（HTTPS）
   - 实现适当的会话 ID 生成机制
   - 考虑会话固定攻击的防范
   - 正确处理会话过期

## 使用场景

1. **多租户应用**

   - 为不同租户使用不同的会话存储
   - 不同的会话过期策略
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
