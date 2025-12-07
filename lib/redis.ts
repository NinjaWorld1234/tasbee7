import { Redis } from '@upstash/redis';

// Initialize Redis client using environment variables
// Supports both generic UPSTASH prefix and Vercel's KV prefix
export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export const KEYS = {
  ROOM: (code: string) => `room:${code}`,
  ROOM_COUNT: (code: string) => `room:${code}:count`, // Atomic counter for room total
  PARTICIPANTS: (code: string) => `room:${code}:participants`, // List of participant metadata
  PARTICIPANT_COUNTS: (code: string) => `room:${code}:p_counts`, // Hash map for participant scores {id: count}
};