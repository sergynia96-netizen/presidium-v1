import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/secure-secret';
import { verifyTwoFactorCode } from '@/lib/two-factor';
import { rateLimit } from '@/lib/rate-limit';
import { consumeDeviceLinkCode, normalizeDeviceLinkCode } from '@/lib/device-link';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as NextAuthOptions['adapter'],
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        twoFactorCode: { label: '2FA Code', type: 'text' },
        deviceLinkOwnerId: { label: 'Device link owner', type: 'text' },
        deviceLinkCode: { label: 'Device link code', type: 'text' },
      },
      async authorize(credentials, req) {
        const forwardedFor =
          req?.headers?.['x-forwarded-for'] ||
          req?.headers?.['x-real-ip'] ||
          '';
        const ip = forwardedFor.split(',')[0]?.trim() || 'unknown';

        const deviceLinkOwnerId = credentials?.deviceLinkOwnerId?.trim() || '';
        const deviceLinkCode = normalizeDeviceLinkCode(credentials?.deviceLinkCode || '');

        if (deviceLinkOwnerId && deviceLinkCode) {
          const linkLimit = rateLimit(`auth:device-link:ip:${ip}`, {
            maxRequests: 20,
            windowMs: 10 * 60 * 1000,
          });
          if (!linkLimit.success) {
            throw new Error('Too many device-link attempts. Please try again later.');
          }

          const user = await consumeDeviceLinkCode(deviceLinkOwnerId, deviceLinkCode);
          if (!user) {
            throw new Error('Invalid or expired device-link code');
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          };
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email.toLowerCase();

        const ipLimit = rateLimit(`auth:login:ip:${ip}`, {
          maxRequests: 30,
          windowMs: 10 * 60 * 1000,
        });
        if (!ipLimit.success) {
          throw new Error('Too many sign-in attempts. Please try again later.');
        }

        const emailLimit = rateLimit(`auth:login:email:${email}`, {
          maxRequests: 10,
          windowMs: 10 * 60 * 1000,
        });
        if (!emailLimit.success) {
          throw new Error('Too many sign-in attempts. Please try again later.');
        }

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user || !user.passwordHash) {
          throw new Error('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error('Invalid email or password');
        }

        if (!user.emailVerified) {
          throw new Error('Email is not verified');
        }

        const settings = await db.userSettings.findUnique({
          where: { userId: user.id },
          select: {
            twoFactorEnabled: true,
            twoFactorSecret: true,
          },
        });

        if (settings?.twoFactorEnabled) {
          if (!settings.twoFactorSecret) {
            throw new Error('Two-factor secret is not configured');
          }

          if (!credentials.twoFactorCode) {
            throw new Error('Two-factor code required');
          }

          let secret = '';
          try {
            secret = decryptSecret(settings.twoFactorSecret);
          } catch {
            throw new Error('Two-factor secret is invalid');
          }

          const validTwoFactorCode = await verifyTwoFactorCode(credentials.twoFactorCode, secret);
          if (!validTwoFactorCode) {
            throw new Error('Invalid two-factor code');
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
pages: {
  signIn: '/login',
  error: '/login',
},
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.avatar = user.avatar;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.avatar = token.avatar as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
