# PRESIDIUM Messenger API Documentation

**Version:** 0.9.0-beta  
**Base URL:** `http://localhost:3000/api`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Chats](#chats)
4. [Messages](#messages)
5. [Contacts](#contacts)
6. [AI Chat](#ai-chat)
7. [OpenClaw Moderation](#openclaw-moderation)
8. [Feed](#feed)
9. [Stories](#stories)
10. [Push Notifications](#push-notifications)

---

## Authentication

### Register User

**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe",
  "username": "johndoe"
}
```

**Response (201):**
```json
{
  "success": true,
  "user": {
    "id": "clxxx...",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "avatar": ""
  }
}
```

**Response (409):**
```json
{
  "error": "User with this email already exists"
}
```

---

### Sign In

**POST** `/auth/[...nextauth]`

Sign in with credentials.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "twoFactorCode": "123456"
}
```

`twoFactorCode` is required only when 2FA is enabled for the account.

**Response (200):**
```json
{
  "user": {
    "id": "clxxx...",
    "name": "John Doe",
    "email": "user@example.com",
    "image": ""
  }
}
```

---

### Send Verification Code

**POST** `/auth/send-code`

Send (or resend) a 6-digit email verification code for onboarding.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification code sent.",
  "expiresAt": "2026-04-02T12:00:00.000Z",
  "devOtpPreview": "123456"
}
```

`devOtpPreview` is returned only in non-production environments.

**Response (429):**
```json
{
  "error": "Too many code requests for this email."
}
```

---

### Verify Email Code

**POST** `/auth/verify-code`

Verify a 6-digit code and mark user email as verified.

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully."
}
```

**Response (400):**
```json
{
  "error": "Invalid or expired verification code."
}
```

---

### Forgot Password

**POST** `/auth/forgot-password`

Request password reset flow for an email (anti-enumeration response).

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If this account exists, password reset instructions have been sent.",
  "expiresAt": "2026-04-02T12:30:00.000Z",
  "devResetPreview": {
    "token": "raw-token",
    "url": "http://localhost:3000/reset-password?token=raw-token"
  }
}
```

`devResetPreview` is returned only in non-production environments.

---

### Reset Password

**POST** `/auth/reset-password`

Set a new password using a valid reset token.

**Request Body:**
```json
{
  "token": "raw-token-from-reset-link",
  "password": "newsecurepassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password was reset successfully."
}
```

**Response (400):**
```json
{
  "error": "Invalid or expired reset token."
}
```

---

### Two-Factor Authentication (TOTP)

**GET** `/users/[id]/2fa`  
Get current 2FA status for authenticated user.

**POST** `/users/[id]/2fa`  
Manage 2FA lifecycle with one of these actions:

```json
{ "action": "setup" }
```

```json
{ "action": "verify_enable", "code": "123456" }
```

```json
{ "action": "disable", "code": "123456" }
```

Setup response includes:
- `secret` (manual key)
- `otpAuthUrl`
- `qrCodeDataUrl`

---

### Get Session

**GET** `/auth/[...nextauth]`

Get current user session.

**Response (200):**
```json
{
  "user": {
    "id": "clxxx...",
    "name": "John Doe",
    "email": "user@example.com",
    "image": ""
  }
}
```

---

### Active Sessions

**GET** `/sessions`

Get active sessions for the authenticated user.

**Response (200):**
```json
{
  "sessions": [
    {
      "id": "current",
      "current": true,
      "userAgent": "Mozilla/5.0 ...",
      "ipAddress": "192.168.1.12",
      "lastActiveAt": "2026-04-06T09:12:00.000Z",
      "expiresAt": "2026-05-06T09:12:00.000Z",
      "deviceType": "desktop",
      "deviceName": "Google Chrome",
      "source": "jwt"
    }
  ],
  "canRevokeOtherSessions": true,
  "canRevokeCurrentSession": false
}
```

`deviceType` can be `desktop | mobile | tablet | unknown`.  
`source` can be `jwt | database`.

---

### Revoke Active Sessions

**DELETE** `/sessions`

Revoke either a specific session or all other sessions.

**Request Body (single session):**
```json
{
  "sessionId": "clx_session_id"
}
```

**Request Body (all other sessions):**
```json
{
  "revokeAllOthers": true
}
```

**Response (200):**
```json
{
  "success": true,
  "deletedCount": 1
}
```

---

## Users

### List Users

**GET** `/users`

Get paginated list of users.

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `search` (optional) - Search by name, email, or username
- `status` (optional) - Filter by status: online, away, offline

**Example:**
```
GET /users?page=1&limit=20&search=john&status=online
```

**Response (200):**
```json
{
  "users": [
    {
      "id": "clxxx...",
      "email": "user@example.com",
      "name": "John Doe",
      "username": "johndoe",
      "avatar": "",
      "status": "online",
      "bio": "Developer",
      "createdAt": "2026-03-31T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasMore": true
  }
}
```

---

### Get User

**GET** `/users/[id]`

Get user by ID.

**Response (200):**
```json
{
  "user": {
    "id": "clxxx...",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "avatar": "",
    "bio": "Developer",
    "phone": "+1234567890",
    "birthday": "1990-01-01",
    "status": "online",
    "createdAt": "2026-03-31T12:00:00.000Z",
    "_count": {
      "chatMembers": 5,
      "aiConversations": 3
    }
  }
}
```

---

### Update User

**PATCH** `/users/[id]`

Update user profile. Only own profile can be updated.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "username": "janedoe",
  "bio": "Senior Developer",
  "phone": "+1234567890",
  "avatar": "https://example.com/avatar.jpg",
  "status": "away"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "clxxx...",
    "email": "user@example.com",
    "name": "Jane Doe",
    "username": "janedoe",
    "avatar": "https://example.com/avatar.jpg",
    "bio": "Senior Developer",
    "phone": "+1234567890",
    "status": "away",
    "updatedAt": "2026-03-31T12:30:00.000Z"
  }
}
```

---

### Delete User

**DELETE** `/users/[id]`

Soft delete user account. Only own account can be deleted.

**Response (200):**
```json
{
  "success": true
}
```

---

## Chats

### List Chats

**GET** `/chats`

Get user's chats with pagination.

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response (200):**
```json
{
  "chats": [
    {
      "id": "clxxx...",
      "type": "private",
      "name": "Chat with Jane",
      "avatar": "",
      "lastMessage": "Hello!",
      "lastMessageTime": "2026-03-31T12:00:00.000Z",
      "unreadCount": 0,
      "isPinned": false,
      "isMuted": false,
      "isEncrypted": true,
      "encryptionType": "e2e",
      "role": "member",
      "members": [
        {
          "id": "clxxx...",
          "name": "Jane Doe",
          "email": "jane@example.com",
          "avatar": "",
          "status": "online"
        }
      ],
      "createdAt": "2026-03-31T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 10,
    "totalPages": 1,
    "hasMore": false
  }
}
```

---

### Create Chat

**POST** `/chats`

Create a new chat.

**Request Body:**
```json
{
  "name": "Project Discussion",
  "type": "group",
  "avatar": "https://example.com/chat-avatar.jpg",
  "memberIds": ["clxxx...", "clyyy..."],
  "isEncrypted": true,
  "encryptionType": "e2e"
}
```

**Response (201):**
```json
{
  "success": true,
  "chat": {
    "id": "clxxx...",
    "name": "Project Discussion",
    "type": "group",
    "avatar": "https://example.com/chat-avatar.jpg",
    "isEncrypted": true,
    "encryptionType": "e2e",
    "members": [...],
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```

---

## Messages

### List Messages

**GET** `/messages`

Get messages for a chat with pagination.

**Query Parameters:**
- `chatId` (required) - Chat ID
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Example:**
```
GET /messages?chatId=clxxx...&page=1&limit=50
```

**Response (200):**
```json
{
  "messages": [
    {
      "id": "clxxx...",
      "chatId": "clyyy...",
      "senderId": "clzzz...",
      "sender": {
        "id": "clzzz...",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatar": "",
        "status": "online"
      },
      "content": "Hello!",
      "type": "text",
      "mediaUrl": null,
      "status": "read",
      "createdAt": "2026-03-31T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2,
    "hasMore": true
  }
}
```

---

### Send Message

**POST** `/messages`

Send a new message.

**Request Body:**
```json
{
  "chatId": "clxxx...",
  "content": "Hello everyone!",
  "type": "text",
  "mediaUrl": "https://example.com/image.jpg"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": {
    "id": "clxxx...",
    "chatId": "clyyy...",
    "senderId": "clzzz...",
    "sender": {
      "id": "clzzz...",
      "name": "John Doe",
      "email": "john@example.com",
      "avatar": "",
      "status": "online"
    },
    "content": "Hello everyone!",
    "type": "text",
    "mediaUrl": "https://example.com/image.jpg",
    "status": "sent",
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```

---

### Get Message

**GET** `/messages/[id]`

Get single message by ID.

**Response (200):**
```json
{
  "message": {
    "id": "clxxx...",
    "chatId": "clyyy...",
    "senderId": "clzzz...",
    "sender": {...},
    "content": "Hello!",
    "type": "text",
    "mediaUrl": null,
    "status": "read",
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```

---

### Update Message

**PATCH** `/messages/[id]`

Update message content or status. Only sender can edit content.

**Request Body:**
```json
{
  "content": "Updated message",
  "status": "read"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": {
    "id": "clxxx...",
    "content": "Updated message",
    "status": "read",
    "updatedAt": "2026-03-31T12:30:00.000Z"
  }
}
```

---

### Delete Message

**DELETE** `/messages/[id]`

Delete a message. Only sender or chat admin can delete.

**Response (200):**
```json
{
  "success": true,
  "message": "Message deleted"
}
```

---

## Contacts

### List Contacts

**GET** `/contacts`

Get user's contacts.

**Query Parameters:**
- `favorites` (optional) - Set to `true` to get only favorites
- `search` (optional) - Search by name or email

**Example:**
```
GET /contacts?favorites=true&search=john
```

**Response (200):**
```json
{
  "contacts": [
    {
      "id": "clxxx...",
      "contactId": "clyyy...",
      "customName": "My Friend John",
      "isFavorite": true,
      "isBlocked": false,
      "contact": {
        "id": "clyyy...",
        "name": "John Doe",
        "email": "john@example.com",
        "avatar": "",
        "status": "online",
        "username": "johndoe",
        "displayName": "My Friend John"
      },
      "createdAt": "2026-03-31T10:00:00.000Z"
    }
  ]
}
```

---

### Add Contact

**POST** `/contacts`

Add a new contact.

**Request Body:**
```json
{
  "contactId": "clyyy...",
  "name": "My Friend John",
  "isFavorite": true
}
```

**Response (201):**
```json
{
  "success": true,
  "contact": {
    "id": "clxxx...",
    "contactId": "clyyy...",
    "customName": "My Friend John",
    "isFavorite": true,
    "isBlocked": false,
    "contact": {
      "id": "clyyy...",
      "name": "John Doe",
      "email": "john@example.com",
      "avatar": "",
      "status": "online",
      "username": "johndoe",
      "displayName": "My Friend John"
    },
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```

---

### Update Contact

**PATCH** `/contacts/[id]`

Update contact information.

**Request Body:**
```json
{
  "name": "Best Friend John",
  "isFavorite": true,
  "isBlocked": false
}
```

**Response (200):**
```json
{
  "success": true,
  "contact": {
    "id": "clxxx...",
    "customName": "Best Friend John",
    "isFavorite": true,
    "isBlocked": false,
    ...
  }
}
```

---

### Delete Contact

**DELETE** `/contacts/[id]`

Delete a contact.

**Response (200):**
```json
{
  "success": true,
  "message": "Contact deleted"
}
```

---

## AI Chat

### Send AI Message

**POST** `/ai-chat`

Send a message to AI assistant.

**Request Body:**
```json
{
  "message": "Summarize this conversation",
  "conversationId": "conv-123",
  "mode": "summarize"
}
```

**Response (200):**
```json
{
  "success": true,
  "response": "Here's a summary of the conversation...",
  "messageCount": 5
}
```

**Response (429 - Rate Limited):**
```json
{
  "error": "Too many requests",
  "retryAfter": 5,
  "message": "Please wait 5 seconds before sending another message"
}
```

---

### Delete Conversation

**DELETE** `/ai-chat`

Delete AI conversation history.

**Request Body:**
```json
{
  "conversationId": "conv-123"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

## OpenClaw Moderation

### Moderate Message

**POST** `/openclaw/moderate`

Analyze message for safety violations.

**Request Body:**
```json
{
  "message": "Send me your bank details",
  "context": "Private chat"
}
```

**Response (200):**
```json
{
  "isSafe": false,
  "riskLevel": "high",
  "categories": ["fraud", "personal_info"],
  "warning": "This message appears to be requesting sensitive personal information",
  "originalMessage": "Send me your bank details",
  "suggestedAction": "Warn the sender and notify the recipient"
}
```

**Response (429 - Rate Limited):**
```json
{
  "error": "Too many moderation requests",
  "retryAfter": 5
}
```

---

## Feed

### List Feed Posts

**GET** `/feed/posts`

Query params:
- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `q` (optional search)

**Response (200):**
```json
{
  "posts": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasMore": false
  }
}
```

### Create Feed Post

**POST** `/feed/posts`

```json
{
  "title": "Optional title",
  "content": "Post content"
}
```

### React To Post

**POST** `/feed/posts/[id]/reactions`

```json
{
  "action": "like"
}
```

`action`: `like | dislike | repost`

### Post Comments

**GET** `/feed/posts/[id]/comments`  
**POST** `/feed/posts/[id]/comments`

```json
{
  "content": "Nice post!"
}
```

---

## Stories

### Create Story

**POST** `/stories`

```json
{
  "type": "image",
  "privacy": "contacts",
  "sourceType": "user",
  "sourceId": "user-id",
  "text": "Caption",
  "mediaUrl": "https://...",
  "e2eMedia": {
    "key": "base64",
    "iv": "base64",
    "tag": "base64"
  }
}
```

### Feed + Source Stories

**GET** `/stories/feed`  
**GET** `/stories/[sourceType]/[sourceId]`

### Story Interactions

**POST** `/stories/[id]/view`  
**POST** `/stories/[id]/reply`  
**DELETE** `/stories/[id]`

---

## Push Notifications

### Subscribe

**POST** `/push/subscribe`

```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "base64",
    "auth": "base64"
  }
}
```

### Unsubscribe

**POST** `/push/unsubscribe`

```json
{
  "endpoint": "https://..."
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid input",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email address"]
    }
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "error": "Not found"
}
```

### 409 Conflict
```json
{
  "error": "User with this email already exists"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests",
  "retryAfter": 5
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/ai-chat` | 10 requests | 10 seconds |
| `/api/openclaw/moderate` | 20 requests | 10 seconds |
| `/api/auth/register` | 5 requests | 10 minutes |
| `/api/auth/send-code` | email/IP limits | 10 minutes |
| `/api/auth/verify-code` | email/IP limits | 10 minutes |
| `/api/auth/forgot-password` | email/IP limits | 10 minutes |
| `/api/auth/reset-password` | IP/token limits | 10 minutes |
| `/api/users/[id]/2fa` | 40 requests | 10 minutes |
| Write endpoints (`POST/PATCH/DELETE`) | route-specific limits | 1-60 minutes |

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Unix timestamp when limit resets
- `Retry-After` - Seconds to wait before retrying

---

## Security

### Authentication
Public endpoints:
- `/api/auth/[...nextauth]`
- `/api/auth/register`
- `/api/auth/send-code`
- `/api/auth/verify-code`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`

All other API endpoints require authentication via NextAuth.js session.

### HTTPS
In production, all API calls should be made over HTTPS.

### CORS
CORS is configured to allow requests from trusted origins only in production.

---

**Last Updated:** April 2, 2026
