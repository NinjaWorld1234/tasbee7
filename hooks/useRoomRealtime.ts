import { useState, useEffect, useRef, useCallback } from 'react';
import { useMasbaha } from '../context/MasbahaContext';
import { Room, Participant } from '../types';

export const useRoomRealtime = (roomCode: string | undefined) => {
  const { 
    currentUserCmdId,
    getMyParticipantId,
    joinRoom: ctxJoinRoom, 
    incrementCount: ctxIncrementCount,
    resetRoom: ctxResetRoom,
    updateRoomTarget: ctxUpdateRoomTarget,
  } = useMasbaha();

  const [room, setRoom] = useState<Room | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);
  
  // Logic for Monotonic Counter (Prevent Rollback)
  // We keep a "Visual Total" that only increases, unless a RESET happens.
  const [visualTotalCount, setVisualTotalCount] = useState(0);
  const pendingTaps = useRef(0);

  // Vibration Preference
  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    return localStorage.getItem('masbaha_vibrate') !== 'false';
  });

  const toggleVibration = () => {
    setVibrationEnabled(prev => {
      const newVal = !prev;
      localStorage.setItem('masbaha_vibrate', String(newVal));
      return newVal;
    });
  };
  
  // Loading and Error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const prevIsCompleted = useRef<boolean>(false);
  const pollInterval = useRef<any>(null);

  // --- Helpers ---

  const playCompletionSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.1 + (i * 0.05));
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 3);
      });
    } catch (e) {
      console.error("Audio play failed", e);
    }
  }, []);

  const triggerVibration = useCallback(() => {
    if (vibrationEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  }, [vibrationEnabled]);

  const triggerCompletionVibration = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([500, 200, 500]);
    }
  }, []);

  // --- Data Fetching ---

  const fetchData = useCallback(async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/room?code=${roomCode}&t=${Date.now()}`); // Cache busting param
      if (res.ok) {
        const data = await res.json();
        
        // Sync Room
        setRoom(data.room);
        
        // Sync Participants
        setParticipants(data.participants.sort((a: Participant, b: Participant) => b.personalCount - a.personalCount));
        
        // --- Anti-Rollback Logic ---
        const serverCount = data.room.totalCount;

        // If server says 0 (reset), we must reset visual
        if (serverCount === 0 && data.room.isCompleted === false) {
           setVisualTotalCount(0);
           pendingTaps.current = 0;
        } else {
           // Otherwise, Visual is strictly Max(CurrentVisual, Server + Pending)
           // This prevents jumping back if poll is stale
           setVisualTotalCount(prev => Math.max(prev, serverCount + pendingTaps.current));
        }

        // Check for completion
        if (data.room.isCompleted && !prevIsCompleted.current) {
          playCompletionSound();
          triggerCompletionVibration();
        }
        prevIsCompleted.current = data.room.isCompleted;
        setError(null);
      } else {
        if (res.status === 404) {
          setError('Room not found');
          setRoom(undefined);
        }
      }
    } catch (err) {
      console.error("Polling error", err);
    } finally {
      setIsLoading(false);
    }
  }, [roomCode, playCompletionSound, triggerCompletionVibration]);

  // --- Effects ---

  useEffect(() => {
    if (!roomCode) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true); // Start loading

    // Load local ID
    const myId = getMyParticipantId(roomCode);
    if (myId) setCurrentParticipantId(myId);

    // Initial Fetch
    fetchData();

    // Start Polling (every 1.5 seconds for MVP realtime)
    pollInterval.current = setInterval(fetchData, 1500);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [roomCode, getMyParticipantId, fetchData]);

  // --- Actions ---

  const joinRoom = async (name: string) => {
    if (!roomCode) return null;
    const p = await ctxJoinRoom(roomCode, name);
    if (p) {
      setCurrentParticipantId(p.id);
      fetchData(); // Immediate fetch
    }
    return p;
  };

  const incrementTasbeeh = () => {
    if (!roomCode || !currentParticipantId || room?.isCompleted) return;
    
    // 1. Optimistic Update (Visual)
    pendingTaps.current += 1;
    setVisualTotalCount(prev => prev + 1);

    // Update personal score immediately for UI
    setParticipants(prev => prev.map(p => 
      p.id === currentParticipantId ? { ...p, personalCount: p.personalCount + 1 } : p
    ).sort((a, b) => b.personalCount - a.personalCount));
    
    // 2. Trigger Side Effects
    triggerVibration();
    
    // 3. Send to Server (Fire and forget, but acknowledge queue decrement)
    ctxIncrementCount(roomCode, currentParticipantId);
    
    // Note: We don't decrement pendingTaps.current here directly because we don't know when the poll will pick it up.
    // Instead, the next poll will bring a higher Server Count.
    // Since Visual = Max(Visual, Server + Pending), if Server increases, Visual stays same or goes up.
    // We let PendingTaps reset only when we confirm server is in sync?
    // Actually, for simplicity in this polling model:
    // We just never let Visual go down. pendingTaps is mostly a helper to boost the visual ahead of the poll.
    // We can slowly bleed pendingTaps if we wanted, but "Max(prev, new)" is sufficient to stop rollback.
  };

  const resetRoomCounters = () => {
    if (!roomCode) return;
    
    // Optimistic
    setVisualTotalCount(0);
    pendingTaps.current = 0;
    setRoom(prev => prev ? { ...prev, totalCount: 0, isCompleted: false } : undefined);
    setParticipants(prev => prev.map(p => ({ ...p, personalCount: 0 })));

    ctxResetRoom(roomCode);
  };

  const updateTarget = (newTarget: number) => {
    if (!roomCode) return;
    ctxUpdateRoomTarget(roomCode, newTarget);
    setTimeout(fetchData, 500); // Sync after short delay
  };

  // Derived owner check
  const isOwner = room?.ownerId === currentUserCmdId;

  return {
    room: room ? { ...room, totalCount: visualTotalCount } : undefined, // Override total with stable visual total
    participants,
    currentParticipantId,
    joinRoom,
    incrementTasbeeh,
    isOwner,
    resetRoomCounters,
    updateTarget,
    isLoading,
    error,
    vibrationEnabled,
    toggleVibration
  };
};