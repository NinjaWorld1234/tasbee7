import { redis, KEYS } from '../lib/redis';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await request.json();
    const { action, roomCode, payload } = body;

    if (!roomCode) return new Response('Room code required', { status: 400 });

    const roomKey = KEYS.ROOM(roomCode);
    const countKey = KEYS.ROOM_COUNT(roomCode);
    const participantsKey = KEYS.PARTICIPANTS(roomCode);
    const pCountsKey = KEYS.PARTICIPANT_COUNTS(roomCode);

    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    if (action === 'JOIN') {
      const { participant } = payload;
      
      // Check for duplicate name
      const currentParticipants = await redis.lrange(participantsKey, 0, -1);
      const nameExists = currentParticipants.some(pStr => {
        try {
          const p = typeof pStr === 'string' ? JSON.parse(pStr) : pStr;
          return p.name.trim() === participant.name.trim();
        } catch (e) {
          return false;
        }
      });

      if (nameExists) {
        return new Response(JSON.stringify({ error: 'Name already taken' }), { status: 409, headers });
      }

      // Add participant to the list
      await redis.rpush(participantsKey, JSON.stringify(participant));
      
      // Refresh expiry
      const pipe = redis.pipeline();
      pipe.expire(roomKey, 60 * 60 * 24 * 30);
      pipe.expire(countKey, 60 * 60 * 24 * 30);
      pipe.expire(participantsKey, 60 * 60 * 24 * 30);
      pipe.expire(pCountsKey, 60 * 60 * 24 * 30);
      await pipe.exec();
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'TAP') {
      const { participantId } = payload;

      // 1. Check if completed first
      const roomData = await redis.get(roomKey) as any;
      if (roomData && roomData.isCompleted) {
         return new Response(JSON.stringify({ success: false, message: 'Completed' }), { headers });
      }

      // 2. Atomic Increments
      const pipe = redis.pipeline();
      pipe.incr(countKey);
      pipe.hincrby(pCountsKey, participantId, 1);
      const results = await pipe.exec();
      
      const newTotal = results[0] as number;

      // 3. Check Target & Update Completion
      if (roomData && roomData.targetCount > 0 && newTotal >= roomData.targetCount) {
        if (!roomData.isCompleted) {
          roomData.isCompleted = true;
          roomData.totalCount = newTotal; 
          await redis.set(roomKey, JSON.stringify(roomData));
        }
      }

      return new Response(JSON.stringify({ success: true, newTotal }), { headers });
    }

    if (action === 'RESET') {
      const roomData = await redis.get(roomKey) as any;
      if (roomData) {
        roomData.isCompleted = false;
        roomData.totalCount = 0;
        
        const pipe = redis.pipeline();
        pipe.set(roomKey, JSON.stringify(roomData));
        pipe.set(countKey, 0);
        pipe.del(pCountsKey); // Clear all personal scores
        await pipe.exec();
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'UPDATE_TARGET') {
      const { newTarget } = payload;
      const roomData = await redis.get(roomKey) as any;
      const currentCount = await redis.get(countKey) as number || 0;
      
      if (roomData) {
        roomData.targetCount = newTarget;
        
        // Re-evaluate completion status
        if (newTarget > 0 && currentCount >= newTarget) {
          roomData.isCompleted = true;
        } else {
          roomData.isCompleted = false;
        }
        
        await redis.set(roomKey, JSON.stringify(roomData));
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response(JSON.stringify({ success: true }), { headers });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Action failed' }), { status: 500 });
  }
}