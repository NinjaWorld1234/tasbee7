import { Redis } from '@upstash/redis';

// نقرأ القيم من المتغيرات البيئية كما هي مضبوطة في لوحة الاستضافة
const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  '';

const redisToken =
  process.env.KV_REST_API_TOKEN ||
  process.env.KV_REST_API_READ_ONLY_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  '';

// في حال لم تضبط المتغيرات البيئية بشكل صحيح، نرمي خطأ واضح
if (!redisUrl || !redisToken) {
  throw new Error(
    'Redis credentials not found. تأكد من ضبط KV_REST_API_URL و KV_REST_API_TOKEN (أو UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) في إعدادات المتغيرات البيئية في الموقع.'
  );
}

// هذا هو العميل الذي تتوقعه ملفات الـ API:
// import { redis, KEYS } from "../lib/redis";
export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

// نفس شكل KEYS الذي تستخدمه ملفات الـ API (لا تغيّره)
export const KEYS = {
  ROOM: (code: string) => `room:${code}`,
  ROOM_COUNT: (code: string) => `room:${code}:count`,              // عدّاد الغرفة الكلي
  PARTICIPANTS: (code: string) => `room:${code}:participants`,     // قائمة المشاركين
  PARTICIPANT_COUNTS: (code: string) => `room:${code}:p_counts`,   // Hash لعدّادات المشاركين
};
