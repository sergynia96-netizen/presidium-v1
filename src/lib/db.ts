import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Environment-aware logging configuration
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isTest
      ? [] // No logging in tests
      : isDevelopment
        ? ['query', 'error', 'warn'] // Full logging in development
        : ['error'], // Only errors in production
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await db.$disconnect()
  })
}
