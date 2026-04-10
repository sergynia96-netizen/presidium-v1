import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { verify } from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive: boolean;
}

interface Message {
  type: string;
  payload: unknown;
  chatId?: string;
  senderId?: string;
  timestamp: string;
}

// Store active connections by user ID
const userSockets = new Map<string, Set<AuthenticatedWebSocket>>();
// Store chat rooms
const chatRooms = new Map<string, Set<AuthenticatedWebSocket>>();

let wss: WebSocketServer | null = null;

export function initializeWebSocketServer(_server: unknown) {
  wss = new WebSocketServer({ 
    noServer: true,
    path: '/api/ws',
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const socket = ws as AuthenticatedWebSocket;
    socket.isAlive = true;

    const url = parse(request.url || '', true);
    const token = url.query.token as string;
    const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;

    // Verify JWT token
    try {
      if (!jwtSecret) {
        throw new Error('JWT secret is not configured');
      }
      if (!token) {
        throw new Error('Missing auth token');
      }

      const decoded = verify(token, jwtSecret) as { id?: string; sub?: string };
      const userId = decoded.id || decoded.sub;
      if (!userId) {
        throw new Error('Token does not contain user identifier');
      }
      socket.userId = userId;

      // Add to user sockets
      let sockets = userSockets.get(userId);
      if (!sockets) {
        sockets = new Set();
        userSockets.set(userId, sockets);
      }
      sockets.add(socket);

      console.warn(`[WS] User ${userId} connected`);
    } catch (error) {
      console.error('[WS] Authentication failed:', error);
      socket.close(4001, 'Unauthorized');
      return;
    }

    // Handle messages
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        handleMessage(socket, message);
      } catch (error) {
        console.error('[WS] Message parse error:', error);
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
      }
    });

    // Handle pong
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // Handle close
    socket.on('close', () => {
      if (socket.userId) {
        userSockets.get(socket.userId)?.delete(socket);
        if (userSockets.get(socket.userId)?.size === 0) {
          userSockets.delete(socket.userId);
        }
        console.warn(`[WS] User ${socket.userId} disconnected`);
      }
    });

    // Send welcome message
    socket.send(JSON.stringify({
      type: 'connected',
      payload: { message: 'Connected to PRESIDIUM WebSocket' },
      timestamp: new Date().toISOString(),
    }));
  });

  // Heartbeat interval
  const interval = setInterval(() => {
    if (!wss) return;

    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedWebSocket;
      if (socket.isAlive === false) {
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

function handleMessage(socket: AuthenticatedWebSocket, message: Message) {
  const { type, payload, chatId } = message;

  switch (type) {
    case 'join_chat':
      if (chatId) {
        joinChatRoom(socket, chatId);
      }
      break;

    case 'leave_chat':
      if (chatId) {
        leaveChatRoom(socket, chatId);
      }
      break;

    case 'typing_start':
      if (chatId && socket.userId) {
        broadcastToChat(chatId, {
          type: 'user_typing',
          payload: { userId: socket.userId, isTyping: true },
          chatId,
          senderId: socket.userId,
          timestamp: new Date().toISOString(),
        }, socket);
      }
      break;

    case 'typing_stop':
      if (chatId && socket.userId) {
        broadcastToChat(chatId, {
          type: 'user_typing',
          payload: { userId: socket.userId, isTyping: false },
          chatId,
          senderId: socket.userId,
          timestamp: new Date().toISOString(),
        }, socket);
      }
      break;

    case 'message_sent':
      if (chatId) {
        broadcastToChat(chatId, {
          type: 'new_message',
          payload,
          chatId,
          senderId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }
      break;

    case 'message_read':
      if (chatId) {
        broadcastToChat(chatId, {
          type: 'message_read',
          payload: { messageId: (payload as { messageId: string }).messageId },
          chatId,
          senderId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }
      break;

    default:
      socket.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown message type: ${type}` },
        timestamp: new Date().toISOString(),
      }));
  }
}

function joinChatRoom(socket: AuthenticatedWebSocket, chatId: string) {
  let room = chatRooms.get(chatId);
  if (!room) {
    room = new Set();
    chatRooms.set(chatId, room);
  }
  room.add(socket);
  
  socket.send(JSON.stringify({
    type: 'joined_chat',
    payload: { chatId },
    timestamp: new Date().toISOString(),
  }));
}

function leaveChatRoom(socket: AuthenticatedWebSocket, chatId: string) {
  chatRooms.get(chatId)?.delete(socket);
  
  socket.send(JSON.stringify({
    type: 'left_chat',
    payload: { chatId },
    timestamp: new Date().toISOString(),
  }));
}

function broadcastToChat(chatId: string, message: Message, excludeSocket?: AuthenticatedWebSocket) {
  const room = chatRooms.get(chatId);
  if (!room) return;

  const data = JSON.stringify(message);
  room.forEach((socket) => {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
}

export function broadcastToUser(userId: string, message: Message) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  const data = JSON.stringify(message);
  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
}

export function getWebSocketServer() {
  return wss;
}
