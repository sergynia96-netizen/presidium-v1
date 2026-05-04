/**
 * Repository implementations for relay service.
 *
 * Each repository implements a domain contract from @presidium/shared-*
 * using Drizzle ORM + PostgreSQL.
 */

export { DrizzleOutboxRepository } from './outbox.js';

// Future repositories:
// export { DrizzleMessageRepository } from './message.js';
// export { DrizzleConversationRepository } from './conversation.js';
