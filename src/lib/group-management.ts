/**
 * Group Management Module
 *
 * Features:
 * - Admin tools (ban/kick/mute)
 * - Granular permissions
 * - Invite links (expiring, limited uses)
 * - Join requests
 * - Slow mode
 * - Group descriptions/rules
 * - Group polls
 * - Topics/forum mode
 * - Anonymous admin posting
 * - Custom admin titles
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member' | 'restricted';
export type GroupPermission =
  | 'send_messages'
  | 'send_media'
  | 'send_polls'
  | 'add_members'
  | 'pin_messages'
  | 'change_info'
  | 'invite_via_link'
  | 'manage_topics';

export interface GroupPermissions {
  send_messages: boolean;
  send_media: boolean;
  send_polls: boolean;
  add_members: boolean;
  pin_messages: boolean;
  change_info: boolean;
  invite_via_link: boolean;
  manage_topics: boolean;
}

export const DEFAULT_MEMBER_PERMISSIONS: GroupPermissions = {
  send_messages: true,
  send_media: true,
  send_polls: true,
  add_members: false,
  pin_messages: false,
  change_info: false,
  invite_via_link: false,
  manage_topics: false,
};

export const DEFAULT_ADMIN_PERMISSIONS: GroupPermissions = {
  ...DEFAULT_MEMBER_PERMISSIONS,
  add_members: true,
  pin_messages: true,
  change_info: true,
  invite_via_link: true,
  manage_topics: true,
};

export interface GroupMember {
  userId: string;
  userName: string;
  userAvatar?: string;
  role: GroupRole;
  permissions: GroupPermissions;
  joinedAt: number;
  invitedBy?: string;
  isMuted: boolean;
  mutedUntil?: number;
  customTitle?: string;
}

export interface InviteLink {
  id: string;
  groupId: string;
  code: string;
  url: string;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  maxUses?: number;
  usedCount: number;
  isRevoked: boolean;
  name?: string;
}

export interface JoinRequest {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message?: string;
  createdAt: number;
}

export interface GroupPoll {
  id: string;
  groupId: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: number;
  closesAt?: number;
  isAnonymous: boolean;
  allowsMultiple: boolean;
  isQuiz: boolean;
  correctOption?: number;
}

export interface PollOption {
  id: number;
  text: string;
  votes: number;
  voters: string[]; // userIds
}

export interface GroupTopic {
  id: string;
  groupId: string;
  name: string;
  icon?: string;
  createdBy: string;
  createdAt: number;
  messageCount: number;
  lastMessageAt?: number;
  isClosed: boolean;
}

export interface GroupSettings {
  id: string;
  name: string;
  description?: string;
  rules?: string;
  avatar?: string;
  isPublic: boolean;
  joinApproval: boolean;
  slowMode: number; // seconds between messages (0 = off)
  historyVisible: boolean;
  memberCount: number;
  maxMembers?: number;
  topics: boolean; // Forum mode
  defaultPermissions: GroupPermissions;
  createdAt: number;
}

// ─── Group Management API ───────────────────────────────────────────────────

/**
 * Update group settings.
 */
export async function updateGroupSettings(
  groupId: string,
  updates: Partial<GroupSettings>,
): Promise<GroupSettings> {
  const response = await fetch(`/api/groups/${groupId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error('Failed to update group settings');
  }

  return response.json();
}

/**
 * Change a member's role.
 */
export async function changeMemberRole(
  groupId: string,
  userId: string,
  role: GroupRole,
  permissions?: GroupPermissions,
): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, permissions }),
  });

  if (!response.ok) {
    throw new Error('Failed to change member role');
  }
}

/**
 * Kick a member from the group.
 */
export async function kickMember(groupId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to kick member');
  }
}

/**
 * Ban a member from the group.
 */
export async function banMember(groupId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}/ban`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to ban member');
  }
}

/**
 * Mute a member (temporarily restrict sending messages).
 */
export async function muteMember(
  groupId: string,
  userId: string,
  durationSeconds: number = 0, // 0 = permanent
): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}/mute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: durationSeconds }),
  });

  if (!response.ok) {
    throw new Error('Failed to mute member');
  }
}

/**
 * Unmute a member.
 */
export async function unmuteMember(groupId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}/unmute`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to unmute member');
  }
}

// ─── Invite Links ───────────────────────────────────────────────────────────

/**
 * Create a new invite link.
 */
export async function createInviteLink(
  groupId: string,
  options: {
    name?: string;
    expiresAt?: number;
    maxUses?: number;
  } = {},
): Promise<InviteLink> {
  const response = await fetch(`/api/groups/${groupId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error('Failed to create invite link');
  }

  return response.json();
}

/**
 * Revoke an invite link.
 */
export async function revokeInviteLink(groupId: string, linkId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/invites/${linkId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to revoke invite link');
  }
}

/**
 * Get all invite links for a group.
 */
export async function getInviteLinks(groupId: string): Promise<InviteLink[]> {
  const response = await fetch(`/api/groups/${groupId}/invites`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.links || [];
}

/**
 * Join a group via invite link.
 */
export async function joinViaInviteLink(code: string): Promise<void> {
  const response = await fetch(`/api/groups/join/${code}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Invalid or expired invite link');
  }
}

// ─── Join Requests ──────────────────────────────────────────────────────────

/**
 * Submit a join request.
 */
export async function submitJoinRequest(
  groupId: string,
  message?: string,
): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/join-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error('Failed to submit join request');
  }
}

/**
 * Get pending join requests.
 */
export async function getJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const response = await fetch(`/api/groups/${groupId}/join-requests`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.requests || [];
}

/**
 * Approve a join request.
 */
export async function approveJoinRequest(groupId: string, requestId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/join-requests/${requestId}/approve`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to approve join request');
  }
}

/**
 * Reject a join request.
 */
export async function rejectJoinRequest(groupId: string, requestId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/join-requests/${requestId}/reject`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to reject join request');
  }
}

// ─── Polls ──────────────────────────────────────────────────────────────────

/**
 * Create a poll in a group.
 */
export async function createPoll(
  groupId: string,
  data: {
    question: string;
    options: string[];
    isAnonymous?: boolean;
    allowsMultiple?: boolean;
    isQuiz?: boolean;
    correctOption?: number;
    closesAt?: number;
  },
): Promise<GroupPoll> {
  const response = await fetch(`/api/groups/${groupId}/polls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create poll');
  }

  return response.json();
}

/**
 * Vote on a poll.
 */
export async function voteOnPoll(
  groupId: string,
  pollId: string,
  optionIds: number[],
): Promise<GroupPoll> {
  const response = await fetch(`/api/groups/${groupId}/polls/${pollId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: optionIds }),
  });

  if (!response.ok) {
    throw new Error('Failed to vote on poll');
  }

  return response.json();
}

/**
 * Close a poll.
 */
export async function closePoll(groupId: string, pollId: string): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/polls/${pollId}/close`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to close poll');
  }
}

// ─── Topics (Forum Mode) ────────────────────────────────────────────────────

/**
 * Create a new topic.
 */
export async function createTopic(
  groupId: string,
  name: string,
  icon?: string,
): Promise<GroupTopic> {
  const response = await fetch(`/api/groups/${groupId}/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icon }),
  });

  if (!response.ok) {
    throw new Error('Failed to create topic');
  }

  return response.json();
}

/**
 * Get all topics for a group.
 */
export async function getTopics(groupId: string): Promise<GroupTopic[]> {
  const response = await fetch(`/api/groups/${groupId}/topics`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.topics || [];
}

/**
 * Close/reopen a topic.
 */
export async function toggleTopic(groupId: string, topicId: string, closed: boolean): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}/topics/${topicId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isClosed: closed }),
  });

  if (!response.ok) {
    throw new Error('Failed to update topic');
  }
}

// ─── Anonymous Admin Posting ────────────────────────────────────────────────

export interface AnonymousAdminPostPayload {
  content: string;
  replyToMessageId?: string;
  attachments?: Array<{
    url: string;
    type: 'image' | 'video' | 'file' | 'voice';
    name?: string;
    size?: number;
  }>;
  metadata?: Record<string, string | number | boolean>;
}

export interface AnonymousAdminPostResult {
  success: boolean;
  messageId?: string;
  postedAt: number;
}

/**
 * Check if a member can post anonymously as admin.
 */
export function canPostAnonymousAdmin(member: Pick<GroupMember, 'role'> | null | undefined): boolean {
  if (!member) return false;
  return member.role === 'owner' || member.role === 'admin';
}

/**
 * Post an anonymous admin message to the group.
 */
export async function postAnonymousAdminMessage(
  groupId: string,
  payload: AnonymousAdminPostPayload,
): Promise<AnonymousAdminPostResult> {
  const response = await fetch(`/api/groups/${groupId}/messages/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to post anonymous admin message');
  }

  return response.json();
}

// ─── Member Count Limits ────────────────────────────────────────────────────

export interface GroupMemberLimitPolicy {
  maxMembers: number;
  reserveSlotsForAdmins: number;
  waitlistEnabled: boolean;
  allowTemporaryOverflow: boolean;
}

export interface MemberLimitCheckResult {
  allowed: boolean;
  remainingSlots: number;
  reason?: 'limit_reached' | 'reserved_admin_slots' | 'invalid_policy';
}

/**
 * Validate if incoming members can be added under current policy.
 */
export function checkMemberCountLimit(
  currentMembers: number,
  incomingMembers: number,
  adminMembers: number,
  policy: GroupMemberLimitPolicy,
): MemberLimitCheckResult {
  if (policy.maxMembers <= 0 || policy.reserveSlotsForAdmins < 0) {
    return { allowed: false, remainingSlots: 0, reason: 'invalid_policy' };
  }

  const remainingSlots = Math.max(0, policy.maxMembers - currentMembers);
  if (incomingMembers <= remainingSlots) {
    return { allowed: true, remainingSlots: remainingSlots - incomingMembers };
  }

  if (policy.allowTemporaryOverflow) {
    return { allowed: true, remainingSlots: 0 };
  }

  const overflow = incomingMembers - remainingSlots;
  const adminReservedAvailable = Math.max(0, policy.reserveSlotsForAdmins - adminMembers);
  if (overflow <= adminReservedAvailable) {
    return { allowed: false, remainingSlots, reason: 'reserved_admin_slots' };
  }

  return { allowed: false, remainingSlots, reason: 'limit_reached' };
}

/**
 * Update group member count policy.
 */
export async function updateMemberLimitPolicy(
  groupId: string,
  policy: GroupMemberLimitPolicy,
): Promise<GroupMemberLimitPolicy> {
  const response = await fetch(`/api/groups/${groupId}/member-limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(policy),
  });

  if (!response.ok) {
    throw new Error('Failed to update member limit policy');
  }

  return response.json();
}

// ─── Anti-Spam + Abuse Reports ──────────────────────────────────────────────

export interface GroupAntiSpamSettings {
  enabled: boolean;
  maxMessagesPerMinute: number;
  maxDuplicateMessages: number;
  maxLinksPerMessage: number;
  maxMentionsPerMessage: number;
  blockCapsSpam: boolean;
  blockSuspiciousUnicode: boolean;
}

export type SpamRisk = 'none' | 'low' | 'medium' | 'high';

export interface SpamSignal {
  kind: 'flood' | 'duplicate' | 'links' | 'mentions' | 'caps' | 'unicode' | 'keyword';
  score: number;
  detail: string;
}

export interface SpamAssessment {
  risk: SpamRisk;
  score: number;
  blocked: boolean;
  signals: SpamSignal[];
}

export interface SpamCheckContext {
  recentMessages?: string[];
  sentMessagesInLastMinute?: number;
}

/**
 * Lightweight local spam scoring for group-level moderation.
 */
export function detectSpam(
  content: string,
  settings: GroupAntiSpamSettings,
  context: SpamCheckContext = {},
): SpamAssessment {
  if (!settings.enabled) {
    return { risk: 'none', score: 0, blocked: false, signals: [] };
  }

  const text = content.trim();
  const lower = text.toLowerCase();
  const signals: SpamSignal[] = [];
  let score = 0;

  const sentInWindow = context.sentMessagesInLastMinute || 0;
  if (sentInWindow > settings.maxMessagesPerMinute) {
    const localScore = 35;
    score += localScore;
    signals.push({ kind: 'flood', score: localScore, detail: 'Message flood in 1-minute window' });
  }

  const duplicates = (context.recentMessages || []).filter((msg) => msg.trim().toLowerCase() === lower).length;
  if (duplicates >= settings.maxDuplicateMessages) {
    const localScore = 30;
    score += localScore;
    signals.push({ kind: 'duplicate', score: localScore, detail: 'Repeated duplicate messages' });
  }

  const linkCount = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (linkCount > settings.maxLinksPerMessage) {
    const localScore = 20;
    score += localScore;
    signals.push({ kind: 'links', score: localScore, detail: 'Too many links in one message' });
  }

  const mentionCount = (text.match(/@\w+/g) || []).length;
  if (mentionCount > settings.maxMentionsPerMessage) {
    const localScore = 15;
    score += localScore;
    signals.push({ kind: 'mentions', score: localScore, detail: 'Excessive user mentions' });
  }

  if (settings.blockCapsSpam) {
    const letters = text.replace(/[^A-Za-zА-Яа-я]/g, '');
    const uppercase = letters.replace(/[^A-ZА-Я]/g, '');
    if (letters.length >= 10 && uppercase.length / letters.length > 0.75) {
      const localScore = 12;
      score += localScore;
      signals.push({ kind: 'caps', score: localScore, detail: 'Potential caps spam' });
    }
  }

  if (settings.blockSuspiciousUnicode) {
    const weirdUnicode = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/.test(text);
    if (weirdUnicode) {
      const localScore = 18;
      score += localScore;
      signals.push({ kind: 'unicode', score: localScore, detail: 'Suspicious invisible unicode symbols' });
    }
  }

  if (/\b(free crypto|airdrop now|click now|guaranteed income)\b/i.test(text)) {
    const localScore = 25;
    score += localScore;
    signals.push({ kind: 'keyword', score: localScore, detail: 'Known spam keywords detected' });
  }

  const risk: SpamRisk = score >= 70 ? 'high' : score >= 40 ? 'medium' : score > 0 ? 'low' : 'none';
  return {
    risk,
    score,
    blocked: risk === 'high',
    signals,
  };
}

export interface AbuseReport {
  groupId: string;
  targetUserId?: string;
  messageId?: string;
  reason: 'spam' | 'abuse' | 'scam' | 'violence' | 'other';
  details?: string;
}

/**
 * Submit spam/abuse report for moderators.
 */
export async function reportSpamOrAbuse(report: AbuseReport): Promise<{ reportId: string; createdAt: number }> {
  const response = await fetch(`/api/groups/${report.groupId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });

  if (!response.ok) {
    throw new Error('Failed to submit report');
  }

  return response.json();
}

// ─── Fake Account Detection ─────────────────────────────────────────────────

export interface AccountRiskProfile {
  createdAt: number;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  contactsCount?: number;
  messagesSent?: number;
  verifiedPhone?: boolean;
}

export interface FakeAccountAssessment {
  risk: SpamRisk;
  score: number;
  reasons: string[];
  suspicious: boolean;
}

/**
 * Heuristic fake account detection for group anti-spam flows.
 */
export function detectFakeAccount(profile: AccountRiskProfile): FakeAccountAssessment {
  const reasons: string[] = [];
  let score = 0;

  const ageMs = Date.now() - profile.createdAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 24) {
    score += 35;
    reasons.push('Account age is less than 24 hours');
  } else if (ageHours < 72) {
    score += 20;
    reasons.push('Account age is less than 72 hours');
  }

  if (!profile.avatarUrl) {
    score += 10;
    reasons.push('No profile photo');
  }

  const shortName = profile.displayName.trim().length < 3;
  const randomName = /[0-9]{4,}/.test(profile.displayName) || /(test|user|qwerty)/i.test(profile.displayName);
  if (shortName || randomName) {
    score += 15;
    reasons.push('Suspicious display name pattern');
  }

  if (!profile.verifiedPhone) {
    score += 15;
    reasons.push('Phone number is not verified');
  }

  if ((profile.contactsCount || 0) === 0 && (profile.messagesSent || 0) === 0) {
    score += 12;
    reasons.push('No social graph or message history');
  }

  if (!profile.bio || profile.bio.trim().length < 2) {
    score += 6;
    reasons.push('Empty profile bio');
  }

  const risk: SpamRisk = score >= 70 ? 'high' : score >= 40 ? 'medium' : score > 0 ? 'low' : 'none';
  return {
    risk,
    score,
    reasons,
    suspicious: risk === 'high' || risk === 'medium',
  };
}
