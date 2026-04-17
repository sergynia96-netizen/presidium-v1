// ─── PRESIDIUM Backend Relay Server ─────────────────
// WebSocket signalling + HTTP API for auth, contacts, groups, channels
// This server is a COMmutator only — it NEVER stores message content.

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer } from 'ws';
import { json } from './utils';
import { sessionManager } from './signaling/session-manager';
import { messageRouter } from './signaling/message-router';
import { updatePresence, goOffline } from './presence/presence-service';
import * as authService from './auth/auth-service';
import * as keyBundleService from './crypto/key-bundle-service';
import * as contactsService from './relay/contacts-service';
import * as groupsChannels from './relay/groups-channels-service';
import * as booksService from './relay/books-service';
import * as marketplaceService from './relay/marketplace-service';
import * as priceIndexService from './relay/price-index-service';
import * as openclawReports from './relay/openclaw-report-service';
import {
  checkHttpRateLimit,
  checkWsAuthRateLimit,
  checkWsMessageRateLimit,
  cleanupRateLimitBuckets,
  extractClientIp,
  getRateLimitStats,
} from './security/rate-limit-service';
import { antiSpamService } from './security/anti-spam-service';
import { prisma } from './prisma';
import type {
  AuthLoginBody,
  AuthRegisterBody,
  AuthVerifyBody,
  PreKeyUploadBody,
  RelayEnvelope,
} from './types';

const PORT = parseInt(process.env.PORT || '3001', 10);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function resolveAllowedOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0] || 'http://localhost:3000';
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0] || 'http://localhost:3000';
}

interface UpdateProfileBody {
  displayName?: string;
  username?: string;
}

interface EmailBody {
  email: string;
}

interface AddContactBody {
  contactId: string;
  nickname?: string;
}

interface BlockBody {
  blocked: boolean;
}

interface CreateGroupBody {
  name: string;
  memberIds?: string[];
}

interface AddGroupMemberBody {
  accountId: string;
}

interface CreateChannelBody {
  name: string;
  description?: string;
  isPublic?: boolean;
}

interface CreateMarketplaceItemBody {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  imageUrl?: string;
  previousItemId?: string;
  originalPurchasePrice?: number;
  daysSincePurchase?: number;
}

interface UpdateMarketplaceItemBody {
  title?: string;
  description?: string;
  price?: number;
  category?: string;
  condition?: string;
  status?: string;
  imageUrl?: string;
}

interface UpdateReadingProgressBody {
  currentChapter?: number;
  scrollPosition?: number;
  percentage?: number;
  bookmarkAdd?: { chapter: number; position: number; label: string };
  bookmarkRemove?: string;
}

interface CreateOpenClawReportBody {
  targetId?: string;
  contextType: string;
  category: string;
  severity: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
}

interface InternalSyncUserBody {
  externalId: string;
  username: string;
  email: string;
  displayName?: string;
  source?: string;
}

// ─── HTTP Server ───────────────────────────────────

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    const origin =
      typeof req.headers.origin === 'string'
        ? req.headers.origin
        : undefined;
    res.writeHead(200, {
      'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || 'GET';
  const clientIp = extractClientIp(req.headers);

  console.log(`[HTTP] ${method} ${path}`);

  try {
    const rate = await checkHttpRateLimit(clientIp, path, method);
    if (rate && !rate.allowed) {
      return send(
        res,
        429,
        {
          error: 'Too many requests',
          code: 'rate_limited',
          retryAfterMs: rate.retryAfterMs,
        },
        {
          'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(Math.floor(rate.resetAt / 1000)),
        },
      );
    }

    // ── Internal: Sync user from Main App ───────
    if (method === 'POST' && path === '/internal/sync/user') {
      if (!INTERNAL_API_KEY) {
        return send(res, 503, { error: 'Internal sync is not configured' });
      }

      const rawAuthHeader = req.headers['authorization'];
      const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token || token !== INTERNAL_API_KEY) {
        return send(res, 401, { error: 'Unauthorized' });
      }

      const body = await json<InternalSyncUserBody>(req);
      const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : '';
      const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
      const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
      const normalizedUsername = rawUsername.replace(/^@+/, '').toLowerCase();
      const normalizedEmail = rawEmail.toLowerCase();
      const normalizedDisplayName = (
        typeof body.displayName === 'string' && body.displayName.trim().length > 0
          ? body.displayName.trim()
          : normalizedUsername
      ).slice(0, 120);

      if (!externalId || !normalizedUsername || !normalizedEmail) {
        return send(res, 400, { error: 'externalId, username, and email are required' });
      }

      const existingById = await prisma.account.findUnique({
        where: { id: externalId },
        select: { id: true },
      });
      const existingByEmail = await prisma.account.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      const existingByUsername = await prisma.account.findUnique({
        where: { username: normalizedUsername },
        select: { id: true },
      });

      // For a new account, do not steal email owned by another account.
      if (!existingById && existingByEmail && existingByEmail.id !== externalId) {
        return send(res, 409, { error: 'Email already exists in relay' });
      }

      const updateData: {
        email?: string;
        username?: string;
        displayName: string;
      } = {
        displayName: normalizedDisplayName,
      };

      if (!existingByEmail || existingByEmail.id === externalId) {
        updateData.email = normalizedEmail;
      }
      if (!existingByUsername || existingByUsername.id === externalId) {
        updateData.username = normalizedUsername;
      }

      const account = await prisma.account.upsert({
        where: { id: externalId },
        update: updateData,
        create: {
          id: externalId,
          email: normalizedEmail,
          passwordHash: '',
          displayName: normalizedDisplayName,
          username: !existingByUsername || existingByUsername.id === externalId ? normalizedUsername : null,
          publicKey: '',
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          updatedAt: true,
        },
      });

      return send(res, 200, { success: true, account });
    }

    // ── Auth: Register ────────────────────────────
    if (method === 'POST' && path === '/api/auth/register') {
      const body = await json<AuthRegisterBody>(req);
      const result = await authService.register(body);
      return send(res, 'error' in result ? 400 : 201, result);
    }

    // ── Auth: Verify Email ───────────────────────
    if (method === 'POST' && path === '/api/auth/verify') {
      const body = await json<AuthVerifyBody>(req);
      const result = await authService.verifyEmail(body.email, body.code);
      return send(res, result.error ? 400 : 200, result);
    }

    // ── Auth: Login ──────────────────────────────
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await json<AuthLoginBody>(req);
      const result = await authService.login(body.email, body.password);
      return send(res, result.error ? 401 : 200, result);
    }

    // ── Auth: Me (get current user) ──────────────
    if (method === 'GET' && path === '/api/auth/me') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const account = await prisma.account.findUnique({
        where: { id: auth.accountId },
        select: { id: true, email: true, displayName: true, username: true, publicKey: true, status: true, createdAt: true },
      });
      if (!account) return send(res, 404, { error: 'User not found' });
      return send(res, 200, { account });
    }

    // ── Auth: Update Profile ─────────────────────
    if (method === 'PUT' && path === '/api/auth/me') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<UpdateProfileBody>(req);
      const account = await prisma.account.update({
        where: { id: auth.accountId },
        data: {
          ...(body.displayName !== undefined && { displayName: body.displayName }),
          ...(body.username !== undefined && { username: body.username?.toLowerCase() }),
        },
        select: { id: true, email: true, displayName: true, username: true, status: true },
      });
      return send(res, 200, { account });
    }

    // ── Auth: Resend OTP ─────────────────────────
    if (method === 'POST' && path === '/api/auth/resend-otp') {
      const body = await json<EmailBody>(req);
      const result = await authService.resendOtp(body.email);
      return send(res, 'error' in result ? 400 : 200, result);
    }

    // ── Users: Search ────────────────────────────
    if (method === 'GET' && path === '/api/users/search') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const query = url.searchParams.get('q') || '';
      if (query.length < 2) return send(res, 200, { users: [] });

      const users = await contactsService.searchUsers(query, auth.accountId);
      return send(res, 200, { users });
    }

    // ── Users: Get by ID ─────────────────────────
    if (method === 'GET' && path.match(/^\/api\/users\/[^/]+$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const userId = path.split('/')[3];
      const user = await prisma.account.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, username: true, status: true, createdAt: true },
      });
      if (!user) return send(res, 404, { error: 'User not found' });
      return send(res, 200, { user });
    }

    // ── Pre-Keys: Upload ─────────────────────────
    if (method === 'POST' && path === '/api/keys/upload') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<PreKeyUploadBody>(req);
      const signedPreKey = typeof body.signedPreKey === 'string' ? body.signedPreKey : '';
      const oneTimePreKeys = Array.isArray(body.oneTimePreKeys)
        ? body.oneTimePreKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
        : [];

      if (!signedPreKey) {
        return send(res, 400, { error: 'signedPreKey is required' });
      }

      // Defensive account provisioning for NextAuth bridge users.
      await authService.ensureAccountExists(auth.accountId);

      // Update identity key on Account if provided (needed for NextAuth bridge users)
      if (typeof body.identityKey === 'string' && body.identityKey.length > 0) {
        await prisma.account.updateMany({
          where: { id: auth.accountId },
          data: { publicKey: body.identityKey },
        });
      }

      const result = await keyBundleService.uploadPreKeys(
        auth.accountId,
        signedPreKey,
        oneTimePreKeys,
        body.signature,
      );
      return send(res, 200, result);
    }

    // ── Pre-Keys: Get Bundle ─────────────────────
    if (method === 'GET' && path.match(/^\/api\/keys\/[^/]+$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const targetId = path.split('/')[3];
      const result = await keyBundleService.getPreKeyBundle(targetId);
      if ('error' in result) return send(res, 404, result);
      return send(res, 200, result);
    }

    // ── Pre-Keys: Mark as Used ───────────────────
    if (method === 'POST' && path.match(/^\/api\/keys\/[^/]+\/use$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const segments = path.split('/');
      const targetId = segments[3];
      const body = await json<{ preKeyId: number }>(req);

      if (typeof body.preKeyId !== 'number') {
        return send(res, 400, { error: 'preKeyId is required' });
      }

      const result = await keyBundleService.markPreKeyAsUsed(targetId, body.preKeyId);
      if (!result.success) return send(res, 404, result);
      return send(res, 200, result);
    }

    // ── Pre-Keys: Count ──────────────────────────
    if (method === 'GET' && path.match(/^\/api\/keys\/[^/]+\/count$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const segments = path.split('/');
      const accountId = segments[3];
      const count = await keyBundleService.getPreKeyCount(accountId);
      return send(res, 200, { count });
    }

    // ── Contacts: List ───────────────────────────
    if (method === 'GET' && path === '/api/contacts') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const contacts = await contactsService.getContacts(auth.accountId);
      return send(res, 200, { contacts });
    }

    // ── Contacts: Add ────────────────────────────
    if (method === 'POST' && path === '/api/contacts') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<AddContactBody>(req);
      const result = await contactsService.addContact(auth.accountId, body.contactId, body.nickname);
      return send(res, result.error ? 400 : 201, result);
    }

    // ── Contacts: Remove ─────────────────────────
    if (method === 'DELETE' && path.match(/^\/api\/contacts\/[^/]+$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const contactId = path.split('/')[3];
      const result = await contactsService.removeContact(auth.accountId, contactId);
      return send(res, 200, result);
    }

    // ── Contacts: Block / Unblock ────────────────
    if (method === 'POST' && path.match(/^\/api\/contacts\/[^/]+\/block$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const contactId = path.split('/')[3];
      const body = await json<BlockBody>(req);
      const result = await contactsService.toggleBlock(auth.accountId, contactId, body.blocked);
      return send(res, 200, result);
    }

    // ── Groups: Create ───────────────────────────
    if (method === 'POST' && path === '/api/groups') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<CreateGroupBody>(req);
      const result = await groupsChannels.createGroup(auth.accountId, body.name, body.memberIds || []);
      return send(res, 201, result);
    }

    // ── Groups: List ─────────────────────────────
    if (method === 'GET' && path === '/api/groups') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const groups = await groupsChannels.getGroups(auth.accountId);
      return send(res, 200, { groups });
    }

    // ── Groups: Add Member ───────────────────────
    if (method === 'POST' && path.match(/^\/api\/groups\/[^/]+\/members$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const groupId = path.split('/')[3];
      const body = await json<AddGroupMemberBody>(req);
      const result = await groupsChannels.addGroupMember(groupId, body.accountId);
      return send(res, result.error ? 400 : 200, result);
    }

    // ── Groups: Leave ────────────────────────────
    if (method === 'POST' && path.match(/^\/api\/groups\/[^/]+\/leave$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const groupId = path.split('/')[3];
      const result = await groupsChannels.leaveGroup(groupId, auth.accountId);
      return send(res, 200, result);
    }

    // ── Channels: Create ────────────────────────
    if (method === 'POST' && path === '/api/channels') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<CreateChannelBody>(req);
      const result = await groupsChannels.createChannel(auth.accountId, body.name, body.description, body.isPublic);
      return send(res, 201, result);
    }

    // ── Channels: List (my subscriptions) ────────
    if (method === 'GET' && path === '/api/channels') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const channels = await groupsChannels.getChannels(auth.accountId);
      return send(res, 200, { channels });
    }

    // ── Channels: Public list ────────────────────
    if (method === 'GET' && path === '/api/channels/public') {
      const channels = await groupsChannels.getPublicChannels();
      return send(res, 200, { channels });
    }

    // ── Channels: Subscribe ──────────────────────
    if (method === 'POST' && path.match(/^\/api\/channels\/[^/]+\/subscribe$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const channelId = path.split('/')[3];
      const result = await groupsChannels.subscribeToChannel(channelId, auth.accountId);
      return send(res, result.error ? 400 : 200, result);
    }

    // ── Channels: Unsubscribe ────────────────────
    if (method === 'POST' && path.match(/^\/api\/channels\/[^/]+\/unsubscribe$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const channelId = path.split('/')[3];
      const result = await groupsChannels.unsubscribeFromChannel(channelId, auth.accountId);
      return send(res, 200, result);
    }

    // ── Books: List ──────────────────────────────
    if (method === 'GET' && path === '/api/books') {
      const category = url.searchParams.get('category') || undefined;
      const language = url.searchParams.get('language') || undefined;
      const search = url.searchParams.get('search') || undefined;
      const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

      const result = await booksService.listBooks({ category, language, search, limit });
      return send(res, 200, result);
    }

    // ── Books: Categories ────────────────────────
    if (method === 'GET' && path === '/api/books/categories') {
      const categories = await booksService.getBookCategories();
      return send(res, 200, { categories });
    }

    // ── Books: User Library ──────────────────────
    if (method === 'GET' && path === '/api/books/library') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const library = await booksService.getUserLibrary(auth.accountId);
      return send(res, 200, { library });
    }

    // ── Books: Reading Progress ──────────────────
    if (method === 'GET' && path.match(/^\/api\/books\/[^/]+\/progress$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const bookId = path.split('/')[3];
      const progress = await booksService.getReadingProgress(auth.accountId, bookId);
      return send(res, 200, { progress });
    }

    if (method === 'POST' && path.match(/^\/api\/books\/[^/]+\/progress$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const bookId = path.split('/')[3];
      const body = await json<UpdateReadingProgressBody>(req);
      const progress = await booksService.updateReadingProgress(auth.accountId, bookId, body || {});
      return send(res, 200, { progress });
    }

    // ── Books: Single ────────────────────────────
    if (method === 'GET' && path.match(/^\/api\/books\/[^/]+$/)) {
      const bookId = path.split('/')[3];
      const book = await booksService.getBook(bookId);
      if (!book) return send(res, 404, { error: 'Book not found' });
      return send(res, 200, { book });
    }

    // ── Marketplace: List Items ──────────────────
    if (method === 'GET' && path === '/api/marketplace/items') {
      const category = url.searchParams.get('category') || undefined;
      const condition = url.searchParams.get('condition') || undefined;
      const sellerId = url.searchParams.get('sellerId') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const sort = url.searchParams.get('sort') || undefined;
      const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
      const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
      const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

      const result = await marketplaceService.listItems({
        category,
        condition,
        sellerId,
        status,
        sort,
        limit,
        offset,
      });
      return send(res, 200, result);
    }

    // ── Marketplace: Item History ────────────────
    if (method === 'GET' && path.match(/^\/api\/marketplace\/items\/[^/]+\/history$/)) {
      const itemId = path.split('/')[4];
      const history = await priceIndexService.getItemHistory(itemId);
      return send(res, 200, { history });
    }

    // ── Marketplace: Get Item ────────────────────
    if (method === 'GET' && path.match(/^\/api\/marketplace\/items\/[^/]+$/)) {
      const itemId = path.split('/')[4];
      const item = await marketplaceService.getItem(itemId);
      if (!item) return send(res, 404, { error: 'Item not found' });
      return send(res, 200, { item });
    }

    // ── Marketplace: Create Item ─────────────────
    if (method === 'POST' && path === '/api/marketplace/items') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const account = await prisma.account.findUnique({
        where: { id: auth.accountId },
        select: { displayName: true, username: true },
      });
      const sellerName = account?.displayName || account?.username || 'Unknown Seller';
      const body = await json<CreateMarketplaceItemBody>(req);

      const result = await marketplaceService.createItem(auth.accountId, sellerName, body);
      return send(res, 'error' in result ? 400 : 201, result);
    }

    // ── Marketplace: Update Item ─────────────────
    if (method === 'PUT' && path.match(/^\/api\/marketplace\/items\/[^/]+$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const itemId = path.split('/')[4];
      const body = await json<UpdateMarketplaceItemBody>(req);
      const result = await marketplaceService.updateItem(itemId, auth.accountId, body);
      return send(res, 'error' in result ? 400 : 200, result);
    }

    // ── Marketplace: Delete Item ─────────────────
    if (method === 'DELETE' && path.match(/^\/api\/marketplace\/items\/[^/]+$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const itemId = path.split('/')[4];
      const result = await marketplaceService.deleteItem(itemId, auth.accountId);
      return send(res, 'error' in result ? 400 : 200, result);
    }

    // ── Marketplace: Purchase ────────────────────
    if (method === 'POST' && path.match(/^\/api\/marketplace\/items\/[^/]+\/purchase$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const itemId = path.split('/')[4];
      const result = await marketplaceService.purchaseItem(itemId, auth.accountId);
      return send(res, 'error' in result ? 400 : 200, result);
    }

    // ── Marketplace: Toggle Favorite ─────────────
    if (method === 'POST' && path.match(/^\/api\/marketplace\/items\/[^/]+\/favorite$/)) {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const itemId = path.split('/')[4];
      const result = await marketplaceService.toggleFavorite(auth.accountId, itemId);
      return send(res, 200, result);
    }

    // ── Marketplace: Search ──────────────────────
    if (method === 'GET' && path === '/api/marketplace/search') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const query = url.searchParams.get('q') || '';
      const category = url.searchParams.get('category') || undefined;
      const condition = url.searchParams.get('condition') || undefined;
      const sort = url.searchParams.get('sort') || undefined;

      const result = await marketplaceService.searchItems(query, auth.accountId, {
        category,
        condition,
        sort,
      });
      return send(res, 200, result);
    }

    // ── Marketplace: Search Suggestions ──────────
    if (method === 'GET' && path === '/api/marketplace/search/suggestions') {
      const auth = await authenticateRequest(req);
      const query = url.searchParams.get('q') || '';
      const result = await marketplaceService.getSearchSuggestions(query, auth?.accountId);
      return send(res, 200, result);
    }

    // ── Marketplace: Personalized Suggestions ────
    if (method === 'GET' && path === '/api/marketplace/suggestions') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const result = await marketplaceService.getSmartSuggestions(auth.accountId);
      return send(res, 200, result);
    }

    // ── Marketplace: Favorites ────────────────────
    if (method === 'GET' && path === '/api/marketplace/favorites') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const items = await marketplaceService.getUserFavorites(auth.accountId);
      return send(res, 200, { items });
    }

    // ── Marketplace: Seller Items ────────────────
    if (method === 'GET' && path === '/api/marketplace/seller/items') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const result = await marketplaceService.getSellerItems(auth.accountId);
      return send(res, 200, result);
    }

    // ── Marketplace: Seller Stats ────────────────
    if (method === 'GET' && path === '/api/marketplace/seller/stats') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const stats = await marketplaceService.getSellerStats(auth.accountId);
      return send(res, 200, { stats });
    }

    // ── Marketplace: Categories ──────────────────
    if (method === 'GET' && path === '/api/marketplace/categories') {
      const categories = await marketplaceService.getCategories();
      return send(res, 200, { categories });
    }

    // ── Marketplace: Price Index ─────────────────
    if (method === 'GET' && path === '/api/marketplace/price-index') {
      const category = url.searchParams.get('category');
      if (category) {
        const index = await priceIndexService.calculateMarketPriceIndex(category);
        return send(res, 200, { category, index });
      }
      const index = await priceIndexService.getFullPriceIndex();
      return send(res, 200, { index });
    }

    // ── OpenClaw Reports: Create ────────────────
    if (method === 'POST' && path === '/api/openclaw/reports') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const body = await json<CreateOpenClawReportBody>(req);
      const result = await openclawReports.createModerationReport({
        accountId: auth.accountId,
        targetId: body.targetId,
        contextType: body.contextType,
        category: body.category,
        severity: body.severity,
        reason: body.reason,
        metadata: body.metadata,
      });
      return send(res, 'error' in result ? 400 : 201, result);
    }

    // ── OpenClaw Reports: List ──────────────────
    if (method === 'GET' && path === '/api/openclaw/reports') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const limitParam = Number(url.searchParams.get('limit') || 50);
      const result = await openclawReports.listModerationReports(auth.accountId, limitParam);
      return send(res, 200, result);
    }

    // ── OpenClaw Reports: Stats ─────────────────
    if (method === 'GET' && path === '/api/openclaw/reports/stats') {
      const auth = await authenticateRequest(req);
      if (!auth) return send(res, 401, { error: 'Unauthorized' });

      const daysParam = Number(url.searchParams.get('days') || 30);
      const result = await openclawReports.getModerationStats(auth.accountId, daysParam);
      return send(res, 200, result);
    }

    // ── Health ───────────────────────────────────
    if (method === 'GET' && path === '/health') {
      const offlineQueue = await messageRouter.getOfflineQueueStats();
      const rateLimit = getRateLimitStats();
      const antiSpam = antiSpamService.getStats();
      return send(res, 200, {
        status: 'ok',
        connections: sessionManager.size(),
        offlineQueue,
        rateLimit,
        antiSpam,
        uptime: process.uptime(),
      });
    }

    // ── 404 ──────────────────────────────────────
    return send(res, 404, { error: 'Not found' });

  } catch (err) {
    console.error('[HTTP] Error:', err);
    return send(res, 500, { error: 'Internal server error' });
  }
});

// ─── WebSocket Server ─────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', async (ws, req) => {
  let accountId: string | null = null;
  const clientIp = extractClientIp(req.headers);
  let isAuthenticated = false;
  let authTimeout: NodeJS.Timeout | null = setTimeout(() => {
    if (!isAuthenticated) {
      ws.close(4001, 'Authentication timeout');
    }
  }, 5000);

  const authenticateSocket = async (token: string): Promise<boolean> => {
    const payload = authService.verifyJWT(token);
    if (!payload) {
      ws.close(4002, 'Invalid token');
      return false;
    }

    accountId = payload.accountId;
    isAuthenticated = true;

    if (authTimeout) {
      clearTimeout(authTimeout);
      authTimeout = null;
    }

    // Auto-provision relay account for NextAuth bridge users
    await authService.ensureAccountExists(accountId);

    // Register session
    sessionManager.register(accountId, ws);
    await updatePresence(accountId, 'online');

    // Send welcome message with online status of contacts
    ws.send(JSON.stringify({
      type: 'connected',
      payload: { accountId, onlineCount: sessionManager.size() },
      timestamp: Date.now(),
    }));

    // Attempt deferred delivery of encrypted envelopes queued while user was offline.
    const queueDelivery = await messageRouter.deliverQueued(accountId);
    if (queueDelivery.delivered > 0 || queueDelivery.dropped > 0) {
      ws.send(
        JSON.stringify({
          type: 'relay.queue.delivered',
          payload: queueDelivery,
          timestamp: Date.now(),
        }),
      );
    }
    return true;
  };

  // Handle incoming WebSocket messages
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        type?: string;
        payload?: Record<string, unknown>;
      };

      if (!isAuthenticated) {
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Authentication required', code: 'auth_required' },
            timestamp: Date.now(),
          }));
          return;
        }

        const authRate = await checkWsAuthRateLimit(clientIp);
        if (!authRate.allowed) {
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: {
                message: 'Rate limit exceeded',
                code: 'rate_limited',
                retryAfterMs: authRate.retryAfterMs,
              },
              timestamp: Date.now(),
            }),
          );
          return;
        }

        const tokenValue = typeof msg.payload?.token === 'string' ? msg.payload.token : '';
        if (!tokenValue) {
          ws.close(4001, 'Authentication required');
          return;
        }

        await authenticateSocket(tokenValue);
        return;
      }

      if (!accountId) {
        ws.close(4002, 'Invalid session');
        return;
      }
      const senderId = accountId;

      const messageRate = await checkWsMessageRateLimit(senderId);
      if (!messageRate.allowed) {
        ws.send(
          JSON.stringify({
            type: 'error',
            payload: {
              message: 'Rate limit exceeded',
              code: 'rate_limited',
              retryAfterMs: messageRate.retryAfterMs,
            },
            timestamp: Date.now(),
          }),
        );
        return;
      }

      const routeToRecipients = async (
        recipientIds: string[],
        envelopeType: 'message' | 'prekey' | 'call_signal',
        content: string,
        moderation?: RelayEnvelope['moderation'],
      ): Promise<{ delivered: number; storedOffline: number; failed: number }> => {
        const routeResults = await Promise.all(
          recipientIds.map((recipientId) =>
            messageRouter.route({
              type: envelopeType,
              from: senderId,
              to: recipientId,
              content,
              timestamp: Date.now(),
              moderation,
            }),
          ),
        );

        let delivered = 0;
        let storedOffline = 0;
        let failed = 0;

        for (const result of routeResults) {
          if (!result.success) {
            failed += 1;
            continue;
          }
          if (result.delivered) delivered += 1;
          else if (result.storedOffline) storedOffline += 1;
        }

        return { delivered, storedOffline, failed };
      };

      const parseModeration = (value: unknown): RelayEnvelope['moderation'] | undefined => {
        if (!value || typeof value !== 'object') return undefined;
        const raw = value as Record<string, unknown>;

        const blocked = Boolean(raw.blocked);
        const source =
          raw.source === 'openclaw' || raw.source === 'server' || raw.source === 'client'
            ? raw.source
            : undefined;
        const riskLevel =
          raw.riskLevel === 'none' ||
          raw.riskLevel === 'low' ||
          raw.riskLevel === 'medium' ||
          raw.riskLevel === 'high' ||
          raw.riskLevel === 'critical'
            ? raw.riskLevel
            : undefined;

        const flags = Array.isArray(raw.flags)
          ? raw.flags
              .map((flag) => {
                if (!flag || typeof flag !== 'object') return null;
                const payload = flag as Record<string, unknown>;
                const category = typeof payload.category === 'string' ? payload.category.trim() : '';
                if (!category) return null;
                const severity: 'low' | 'medium' | 'high' | undefined =
                  payload.severity === 'low' || payload.severity === 'medium' || payload.severity === 'high'
                    ? payload.severity
                    : undefined;
                const description =
                  typeof payload.description === 'string'
                    ? payload.description.slice(0, 240)
                    : undefined;

                return {
                  category,
                  severity,
                  description,
                };
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
          : undefined;

        if (!blocked && !riskLevel && !source && (!flags || flags.length === 0)) {
          return undefined;
        }

        return {
          blocked,
          riskLevel,
          source,
          flags: flags && flags.length > 0 ? flags : undefined,
        };
      };

      const parseContentMeta = (
        content: string,
      ): { messageId?: string; chatId?: string; event?: string } => {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          return {
            messageId: typeof parsed.id === 'string' ? parsed.id : undefined,
            chatId: typeof parsed.chatId === 'string' ? parsed.chatId : undefined,
            event: typeof parsed.event === 'string' ? parsed.event : undefined,
          };
        } catch {
          return {};
        }
      };

      switch (msg.type) {
        // ── Ping / Pong ─────────────────────────
        case 'ping':
          sessionManager.ping(accountId);
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        // ── Relay encrypted envelope ───────────
        case 'relay.envelope': {
          const envelope = msg.payload || {};
          const envelopeTypeRaw = envelope.type;
          const envelopeType =
            envelopeTypeRaw === 'message' ||
            envelopeTypeRaw === 'prekey' ||
            envelopeTypeRaw === 'call_signal'
              ? envelopeTypeRaw
              : 'message';
          const to = typeof envelope.to === 'string' ? envelope.to : '';
          const content = typeof envelope.content === 'string' ? envelope.content : '';
          const moderation = parseModeration(envelope.moderation);
          const contentMeta = parseContentMeta(content);

          if (!to || !content) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Invalid relay envelope', code: 'invalid_envelope' },
              timestamp: Date.now(),
            }));
            break;
          }

          const spamCheck = antiSpamService.checkMessage({
            senderId,
            content,
            recipientCount: 1,
          });
          if (!spamCheck.allowed) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: {
                  message: spamCheck.message || 'Spam policy violation',
                  code: spamCheck.code || 'spam_blocked',
                  retryAfterMs: spamCheck.retryAfterMs || 0,
                },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          const routeResult = await messageRouter.route({
            type: envelopeType,
            from: senderId,
            to,
            content,
            timestamp: Date.now(),
            moderation,
          });

          if (!routeResult.success) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: {
                  message: routeResult.error || 'Failed to route message',
                  code: 'route_blocked',
                },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          ws.send(
            JSON.stringify({
              type: 'relay.ack',
              payload: {
                to,
                delivered: routeResult.delivered ?? false,
                storedOffline: routeResult.storedOffline ?? false,
                queueSize: routeResult.queueSize ?? 0,
                queuedMessageId: routeResult.queuedMessageId ?? null,
                messageId: contentMeta.messageId ?? null,
                chatId: contentMeta.chatId ?? null,
                event: contentMeta.event ?? null,
              },
              timestamp: Date.now(),
            }),
          );
          break;
        }

        // ── Relay encrypted group envelope ──────
        case 'relay.group_envelope': {
          const envelope = msg.payload || {};
          const groupId = typeof envelope.groupId === 'string' ? envelope.groupId : '';
          const content = typeof envelope.content === 'string' ? envelope.content : '';
          const moderation = parseModeration(envelope.moderation);
          const contentMeta = parseContentMeta(content);
          const envelopeTypeRaw = envelope.type;
          const envelopeType =
            envelopeTypeRaw === 'message' ||
            envelopeTypeRaw === 'prekey' ||
            envelopeTypeRaw === 'call_signal'
              ? envelopeTypeRaw
              : 'message';

          if (!groupId || !content) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: 'Invalid group envelope', code: 'invalid_group_envelope' },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          const isMember = await groupsChannels.isGroupMember(groupId, senderId);
          if (!isMember) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: 'Group access denied', code: 'group_access_denied' },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          const recipients = await groupsChannels.getGroupRecipientIds(groupId, senderId);
          const spamCheck = antiSpamService.checkMessage({
            senderId,
            content,
            recipientCount: Math.max(1, recipients.length),
          });
          if (!spamCheck.allowed) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: {
                  message: spamCheck.message || 'Spam policy violation',
                  code: spamCheck.code || 'spam_blocked',
                  retryAfterMs: spamCheck.retryAfterMs || 0,
                },
                timestamp: Date.now(),
              }),
            );
            break;
          }
          const stats = await routeToRecipients(recipients, envelopeType, content, moderation);

          ws.send(
            JSON.stringify({
              type: 'relay.group_ack',
              payload: {
                groupId,
                totalRecipients: recipients.length,
                delivered: stats.delivered,
                storedOffline: stats.storedOffline,
                failed: stats.failed,
                messageId: contentMeta.messageId ?? null,
                chatId: contentMeta.chatId ?? null,
                event: contentMeta.event ?? null,
              },
              timestamp: Date.now(),
            }),
          );
          break;
        }

        // ── Relay encrypted channel envelope ────
        case 'relay.channel_envelope': {
          const envelope = msg.payload || {};
          const channelId = typeof envelope.channelId === 'string' ? envelope.channelId : '';
          const content = typeof envelope.content === 'string' ? envelope.content : '';
          const moderation = parseModeration(envelope.moderation);
          const contentMeta = parseContentMeta(content);
          const envelopeTypeRaw = envelope.type;
          const envelopeType =
            envelopeTypeRaw === 'message' ||
            envelopeTypeRaw === 'prekey' ||
            envelopeTypeRaw === 'call_signal'
              ? envelopeTypeRaw
              : 'message';

          if (!channelId || !content) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: 'Invalid channel envelope', code: 'invalid_channel_envelope' },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          const isSubscriber = await groupsChannels.isChannelSubscriber(channelId, senderId);
          if (!isSubscriber) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: 'Channel access denied', code: 'channel_access_denied' },
                timestamp: Date.now(),
              }),
            );
            break;
          }

          const recipients = await groupsChannels.getChannelRecipientIds(channelId, senderId);
          const spamCheck = antiSpamService.checkMessage({
            senderId,
            content,
            recipientCount: Math.max(1, recipients.length),
          });
          if (!spamCheck.allowed) {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: {
                  message: spamCheck.message || 'Spam policy violation',
                  code: spamCheck.code || 'spam_blocked',
                  retryAfterMs: spamCheck.retryAfterMs || 0,
                },
                timestamp: Date.now(),
              }),
            );
            break;
          }
          const stats = await routeToRecipients(recipients, envelopeType, content, moderation);

          ws.send(
            JSON.stringify({
              type: 'relay.channel_ack',
              payload: {
                channelId,
                totalRecipients: recipients.length,
                delivered: stats.delivered,
                storedOffline: stats.storedOffline,
                failed: stats.failed,
                messageId: contentMeta.messageId ?? null,
                chatId: contentMeta.chatId ?? null,
                event: contentMeta.event ?? null,
              },
              timestamp: Date.now(),
            }),
          );
          break;
        }

        // ── Typing indicator ────────────────────
        case 'typing.start':
        case 'typing.stop': {
          const to = typeof msg.payload?.to === 'string' ? msg.payload.to : '';
          if (to) {
            await messageRouter.sendTyping(senderId, to, msg.type === 'typing.start');
          }
          break;
        }

        // ── WebRTC Call Signals ────────────────
        case 'call.offer':
        case 'call.answer':
        case 'call.ice_candidate':
        case 'call.hangup': {
          const to = typeof msg.payload?.to === 'string' ? msg.payload.to : '';
          if (to) {
            const delivered = await messageRouter.routeCallSignal(senderId, to, msg.type, msg.payload || {});
            if (!delivered) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  payload: {
                    message: 'Call signal blocked or recipient offline',
                    code: 'call_signal_not_delivered',
                  },
                  timestamp: Date.now(),
                }),
              );
            }
          }
          break;
        }

        default:
          console.log(`[WS] Unknown message type from ${accountId}: ${msg.type}`);
      }
    } catch (err) {
      console.error(`[WS] Parse error from ${accountId}:`, err);
    }
  });

  // Handle disconnect
  ws.on('close', async () => {
    if (authTimeout) {
      clearTimeout(authTimeout);
      authTimeout = null;
    }
    if (accountId) {
      sessionManager.unregister(accountId);
      await goOffline(accountId);
    }
  });

  ws.on('error', (err) => {
    if (accountId) {
      console.error(`[WS] Error for ${accountId}:`, err.message);
      sessionManager.unregister(accountId);
    } else {
      console.error('[WS] Error for unauthenticated socket:', err.message);
    }
  });
});

// ─── Stale Connection Cleanup ─────────────────────

setInterval(async () => {
  const cleaned = sessionManager.cleanupStale(90000); // 90s timeout
  const cleanedDistributedSessions = await sessionManager.cleanupDistributed();
  const expiredQueued = await messageRouter.cleanupExpiredQueues();
  const expiredRateLimitBuckets = cleanupRateLimitBuckets();
  const expiredSpamWindows = antiSpamService.cleanup();
  if (cleaned.length > 0) {
    console.log(`[CLEANUP] Removed ${cleaned.length} stale connections`);
  }
  if (expiredQueued > 0) {
    console.log(`[CLEANUP] Removed ${expiredQueued} expired queued envelopes`);
  }
  if (expiredRateLimitBuckets > 0) {
    console.log(`[CLEANUP] Removed ${expiredRateLimitBuckets} expired rate-limit buckets`);
  }
  if (expiredSpamWindows.senderWindows > 0 || expiredSpamWindows.duplicateWindows > 0) {
    console.log(
      `[CLEANUP] Removed ${expiredSpamWindows.senderWindows} sender spam windows and ${expiredSpamWindows.duplicateWindows} duplicate spam windows`,
    );
  }
  if (cleanedDistributedSessions > 0) {
    console.log(`[CLEANUP] Removed ${cleanedDistributedSessions} stale distributed session records`);
  }
}, 30000);

// ─── Keepalive — prevent sandbox from killing idle process ──

setInterval(() => {
  // Self-ping to keep the event loop active and the process alive
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, 15000);

// ─── Helpers ───────────────────────────────────────

function send(
  res: ServerResponse<IncomingMessage>,
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const origin =
    typeof res?.req?.headers?.origin === 'string'
      ? res.req.headers.origin
      : undefined;

  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

async function authenticateRequest(req: IncomingMessage): Promise<{ accountId: string; deviceId: string } | null> {
  const rawAuthHeader = req.headers['authorization'];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const result = authService.verifyJWT(authHeader.slice(7));
  if (result) {
    // Auto-provision relay account for NextAuth bridge users
    await authService.ensureAccountExists(result.accountId);
  }
  return result;
}

// ─── Start ────────────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     PRESIDIUM Backend Relay Server       ║');
  console.log('║     WebSocket + HTTP API                  ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  HTTP:  http://localhost:${PORT}            ║`);
  console.log(`║  WS:    ws://localhost:${PORT}/ws            ║`);
  console.log('║  Health: /health                          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  booksService.seedBooks().catch((err) => {
    console.error('[BOOKS] Seed failed:', err);
  });
});
