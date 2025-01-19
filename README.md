# farrow-session

A session middleware for [Farrow](https://github.com/farrow-js/farrow) framework, providing flexible and decoupled session management.

[中文文档](./README_CN.md)

## Features

- 🔌 Decoupled Design: Separate parser and store implementations
- 🛠 Flexible Configuration: Support multiple middleware instances
- 🔒 Customizable Security: Support custom authentication mechanisms
- 🍪 Cookie Support: Built-in cookie-based parser and store implementations
- 🎯 Type Safety: Complete TypeScript type support

## Design Philosophy

Although named as "farrow-session", this middleware adopts a more flexible design approach:

1. Decoupled Information Flow and Separation of Concerns

   - SessionInfo: Exchange information between client and server (e.g., sessionId, accessToken, refreshToken)
   - SessionMeta: Exchange information between Parser and Store (e.g., sessionId/accessToken/refreshToken with expiration time)
   - SessionData: Exchange information between Store and Context (server-side only data, like user info, permissions)

2. Independent Component Design

   - SessionParser: Handles parsing and response setting
   - SessionStore: Manages session storage and validation
   - SessionContext: Controls session lifecycle within requests

3. Flexible Session Management

   - No built-in expiration mechanism, developers can customize expiration logic
   - Customizable session validation logic
   - Support for various authentication scenarios (Session, JWT, OAuth, etc.)

4. Multiple Middleware Support
   - Support multiple middleware instances, each with different configurations and functionalities

This design makes the middleware adaptable to various authentication scenarios and requirements, such as:

- Traditional server-side session management
- JWT-based authentication and token renewal
- OAuth2 refresh token handling
- Hybrid authentication systems
- Seamless renewal or dynamic session validity management

## Type Definitions

Please refer to [session.ts](./src/session.ts) and [cookie.ts](./src/cookie.ts) for type definitions
and comments

## Installation

```bash
# npm
npm install @aisonren/farrow-session
# pnpm
pnpm add @aisonren/farrow-session
# yarn
yarn add @aisonren/farrow-session
```

## Usage

### Basic Usage (Cookie Implementation)

```typescript
import { Http } from 'farrow-http'
import { createSessionCtx, cookieSessionParser, cookieSessionStore } from '@aisonren/farrow-session'

// Create session context
const sessionCtx = createSessionCtx<{ userId?: string }>({ userId: undefined })

// Create session parser
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours, when expiresTime/expireTime exists in sessionMeta passed to parser.set, it will be used as cookie's expires and ignore maxAge
    httpOnly: true,
  },
})

// Create session store
const store = cookieSessionStore({
  sessionStoreKey: 'sess:store',
  expiresOptions: {
    rolling: true,
    time: 24 * 60 * 60 * 1000, // 24 hours, when expiresTime/expireTime exists in sessionMeta passed to parser.set, it will be used as cookie's expires and ignore maxAge
  },
  cookieOptions: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
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
http.use(() => {
  // Get session data
  const data = sessionCtx.get()

  // Set session data
  sessionCtx.set({ userId: '123' })

  // Regenerate session ID
  await sessionCtx.regenerateId()

  // Destroy session
  await sessionCtx.destroy()

  return Response.json({ success: true })
})
```

### Custom Cookie Session Parser Codec

You can provide custom encoders/decoders for cookieSessionParser:

```typescript
const parser = cookieSessionParser({
  sessionIdKey: 'sess:id',
  customCodec: {
    encode: (plainSessionId: string) => {
      // Custom encoding logic
      return Buffer.from(plainSessionId).toString('base64')
    },
    decode: (encodedSessionId: string) => {
      // Custom decoding logic
      return Buffer.from(encodedSessionId, 'base64').toString('utf8')
    },
  },
})
```

### Custom SessionStore

You can provide custom storage implementation for SessionStore:

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

### Multiple Session Middleware

You can create multiple session middleware instances for different purposes:

```typescript
// Admin session (with strict security measures)
const adminSession = createFarrowSession({
  sessionCtx: adminSessionCtx,
  sessionParser: headerSessionParser,
  sessionStore: redisSessionStore,
})

// User session (with cookie-based storage)
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

1. The built-in `cookieSessionStore` is provided for development convenience only and is not recommended for storing sensitive data in production. Consider using dedicated session stores (like Redis, MongoDB) for better security.

2. The middleware does not include any default parser or store implementations. You must explicitly choose and configure them based on your security requirements.

## Use Cases

1. **Multi-tenant Applications**

   - Different session stores for different tenants
   - Different session expiration strategies, such as:
     - Fixed expiration time
     - Risk assessment based on user activity
   - Custom session data structures

2. **Mixed Authentication Systems**

   - API tokens for mobile clients
   - Cookie-based sessions for web clients
   - OAuth tokens for third-party applications

3. **Microservices Architecture**

   - Distributed session storage
   - Service-specific session configurations
   - Cross-service session sharing

## License

MIT
