import { redis, KEYS } from '../lib/redis';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response(JSON.stringify({ error: 'Code required' }), { status: 400 });
  }

  try {
    // Pipeline to fetch all necessary data in one round-trip
    const pipe = redis.pipeline();
    pipe.get(KEYS.ROOM(code));                           // 0: Room Metadata
    pipe.get(KEYS.ROOM_COUNT(code));                     // 1: Total Count (Atomic)
    pipe.lrange(KEYS.PARTICIPANTS(code), 0, -1);         // 2: Participants List
    pipe.hgetall(KEYS.PARTICIPANT_COUNTS(code));         // 3: Participant Scores
    
    const results = await pipe.exec();
    
    let roomData = results[0] as any;
    
    if (!roomData) {
      return new Response(JSON.stringify({ error: 'Room not found' }), { 
        status: 404,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      });
    }

    // Handle case where Redis returns a string instead of object
    if (typeof roomData === 'string') {
      try {
        roomData = JSON.parse(roomData);
      } catch (e) {
        console.error("Failed to parse room JSON", e);
        return new Response(JSON.stringify({ error: 'Data corruption' }), { status: 500 });
      }
    }

    const totalCount = parseInt((results[1] as string) || '0');
    
    // Handle participants list which might be strings
    const rawParticipants = results[2] as (string | object)[];
    const participantsList = rawParticipants.map(p => {
      if (typeof p === 'string') {
        try { return JSON.parse(p); } catch (e) { return null; }
      }
      return p;
    }).filter(Boolean); // Filter out failed parses

    const participantScores = (results[3] as Record<string, number>) || {};

    // Merge data
    const room = {
      ...roomData,
      totalCount: totalCount
    };

    const participants = participantsList.map((p: any) => ({
      ...p,
      personalCount: parseInt(String(participantScores[p.id] || 0))
    }));

    return new Response(JSON.stringify({ 
      room, 
      participants 
    }), {
      headers: { 
        'content-type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }
}