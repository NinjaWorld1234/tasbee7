import { Redis } from '@upstash/redis';

// نوع مساعد لضبط أنواع المتغيرات البيئية (للتسهيل في TypeScript)
type RedisEnv = {
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  KV_REST_API_READ_ONLY_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

// دالة مساعدة آمنة للحصول على process.env حتى لو كنا في بيئة لا تحتويه
const getEnv = (): RedisEnv => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env as unknown as RedisEnv;
  }
  return {};
};

// دالة إنشاء عميل Redis
// يمكن لاحقاً إن أحببت أن تستعمل الوضع 'ro' للقراءة فقط
export const getRedisClient = (mode: 'rw' | 'ro' = 'rw') => {
  const env = getEnv();

  // 1) الـ URL
  // نعتمد أولاً على KV_REST_API_URL كما أرسلتَ، مع دعم UPSTASH_REDIS_REST_URL كاحتمال ثانٍ
  const url =
    env.KV_REST_API_URL ||
    env.UPSTASH_REDIS_REST_URL ||
    '';

  // 2) الـ TOKEN
  // في وضع القراءة/الكتابة نفضّل التوكن الكامل، وفي وضع القراءة نفضّل read-only
  const token =
    mode === 'ro'
      ? (
          env.KV_REST_API_READ_ONLY_TOKEN ||
          env.KV_REST_API_TOKEN ||
          env.UPSTASH_REDIS_REST_TOKEN ||
          ''
        )
      : (
          env.KV_REST_API_TOKEN ||
          env.UPSTASH_REDIS_REST_TOKEN ||
          env.KV_REST_API_READ_ONLY_TOKEN ||
          ''
        );

  if (!url || !token) {
    // رسالة واضحة لو حصل خلل في المتغيرات البيئية
    throw new Error(
      'Redis credentials not found. تأكد من ضبط KV_REST_API_URL و KV_REST_API_TOKEN (أو UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) في إعدادات المتغيرات البيئية في الموقع.'
    );
  }

  return new Redis({
    url,
    token,
  });
};

// مفاتيح ثابتة منظمة لاستعمالها في جميع الـ API
export const KEYS = {
  ROOM: (code: string) => `room:${code}`,
  PARTICIPANTS: (code: string) => `room:${code}:participants`,
  // عدّاد الغرفة الكلي
  ROOM_COUNT: (code: string) => `room:${code}:count`,
  // عدّاد شخص معيّن داخل غرفة معيّنة
  PARTICIPANT_COUNT: (code: string, id: string) =>
    `room:${code}:p:${id}:count`,
};
