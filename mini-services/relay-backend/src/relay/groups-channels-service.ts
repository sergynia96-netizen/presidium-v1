// ─── Groups & Channels Service ─────────────────────

import { prisma } from '../prisma';

// ─── Groups ────────────────────────────────────────

export async function createGroup(createdBy: string, name: string, memberIds: string[]) {
  const allMemberIds = [...new Set([createdBy, ...memberIds])];

  const group = await prisma.group.create({
    data: {
      name,
      createdBy,
      members: {
        create: allMemberIds.map((id, i) => ({
          accountId: id,
          role: i === 0 ? 'admin' : 'member',
        })),
      },
    },
    include: {
      members: {
        include: {
          account: {
            select: { id: true, displayName: true, username: true, status: true },
          },
        },
      },
    },
  });

  return { success: true, group };
}

export async function getGroups(accountId: string) {
  return prisma.groupMember.findMany({
    where: { accountId },
    include: {
      group: {
        include: {
          members: {
            include: {
              account: {
                select: { id: true, displayName: true, username: true, status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { group: { updatedAt: 'desc' } },
  });
}

export async function addGroupMember(groupId: string, accountId: string) {
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_accountId: { groupId, accountId } },
  });
  if (existing) return { error: 'Already a member' };

  await prisma.groupMember.create({
    data: { groupId, accountId },
  });

  await prisma.group.update({
    where: { id: groupId },
    data: { updatedAt: new Date() },
  });

  return { success: true };
}

export async function removeGroupMember(groupId: string, accountId: string) {
  await prisma.groupMember.deleteMany({
    where: { groupId, accountId },
  });

  await prisma.group.update({
    where: { id: groupId },
    data: { updatedAt: new Date() },
  });

  return { success: true };
}

export async function leaveGroup(groupId: string, accountId: string) {
  return removeGroupMember(groupId, accountId);
}

export async function isGroupMember(groupId: string, accountId: string): Promise<boolean> {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_accountId: { groupId, accountId } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function getGroupRecipientIds(groupId: string, senderId: string): Promise<string[]> {
  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      accountId: { not: senderId },
    },
    select: { accountId: true },
  });
  return members.map((member) => member.accountId);
}

// ─── Channels ─────────────────────────────────────

export async function createChannel(createdBy: string, name: string, description?: string, isPublic = false) {
  const channel = await prisma.channel.create({
    data: {
      name,
      description,
      isPublic,
      createdBy,
      subscribers: {
        create: { accountId: createdBy },
      },
    },
  });

  return { success: true, channel };
}

export async function getChannels(accountId: string) {
  return prisma.channelSubscriber.findMany({
    where: { accountId },
    include: {
      channel: {
        include: {
          subscribers: { select: { id: true } },
        },
      },
    },
    orderBy: { channel: { createdAt: 'desc' } },
  });
}

export async function getPublicChannels() {
  return prisma.channel.findMany({
    where: { isPublic: true },
    include: {
      subscribers: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function subscribeToChannel(channelId: string, accountId: string) {
  const existing = await prisma.channelSubscriber.findUnique({
    where: { channelId_accountId: { channelId, accountId } },
  });
  if (existing) return { error: 'Already subscribed' };

  await prisma.channelSubscriber.create({
    data: { channelId, accountId },
  });

  return { success: true };
}

export async function unsubscribeFromChannel(channelId: string, accountId: string) {
  await prisma.channelSubscriber.deleteMany({
    where: { channelId, accountId },
  });
  return { success: true };
}

export async function isChannelSubscriber(channelId: string, accountId: string): Promise<boolean> {
  const subscription = await prisma.channelSubscriber.findUnique({
    where: { channelId_accountId: { channelId, accountId } },
    select: { id: true },
  });
  return Boolean(subscription);
}

export async function getChannelRecipientIds(channelId: string, senderId: string): Promise<string[]> {
  const subscribers = await prisma.channelSubscriber.findMany({
    where: {
      channelId,
      accountId: { not: senderId },
    },
    select: { accountId: true },
  });
  return subscribers.map((subscriber) => subscriber.accountId);
}
