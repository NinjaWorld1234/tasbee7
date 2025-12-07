import { redis, KEYS } from '../lib/redis';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await request.json();
    const { id, code, name, phrase, phraseImage, targetCount, ownerId, createdAt } = body;

    const room = {
      id,
      code,
      name,
      phrase,
      phraseImage,
      targetCount,
      // totalCount is stored separately for atomicity, but we keep 0 here for structure
      totalCount: 0, 
      isCompleted: false,
      createdAt,
      ownerId
    };

    const pipeline = redis.pipeline();
    
    // Save room metadata
    pipeline.set(KEYS.ROOM(code), JSON.stringify(room));
    // Initialize atomic counter
    pipeline.set(KEYS.ROOM_COUNT(code), 0);
    // Set expiry (30 days)
    pipeline.expire(KEYS.ROOM(code), 60 * 60 * 24 * 30);
    pipeline.expire(KEYS.ROOM_COUNT(code), 60 * 60 * 24 * 30);

    await pipeline.exec();

    return new Response(JSON.stringify(room), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Failed to create room' }), { status: 500 });
  }
}