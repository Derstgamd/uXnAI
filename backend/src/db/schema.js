import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const subscriptionEnum = pgEnum('subscription_tier', ['free', 'pro', 'ultra'])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  isAnon: boolean('is_anon').default(false),
  subscriptionTier: subscriptionEnum('subscription_tier').default('free'),
  googleId: text('google_id').unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').references(() => users.id),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow(),
})
export const messages = pgTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  conversationId: text('conversation_id').references(() => conversations.id),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})