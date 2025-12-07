import React, { useState, useRef, useEffect } from 'react';

interface DraggableMasbahaProps {
  totalCount: number;
  personalCount: number;
  isCompleted: boolean;
  onTap: () => void;
}

export const DraggableMasbaha: React.FC<DraggableMasbahaProps> = ({
  totalCount,
  personalCount,
  isCompleted,
  onTap
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const basePosRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // قفل بسيط حتى لا تنفذ الكبسة مرتين لنفس الحدث
  const tapLockRef = useRef(false);

  const safeTap = () => {
    if (tapLockRef.current || isCompleted) return;
    tapLockRef.current = true;
    onTap();
    // نفتح القفل بعد زمن قصير
    setTimeout(() => {
      tapLockRef.current = false;
    }, 120);
  };

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (isCompleted) return;

    buttonRef.current?.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    basePosRef.current = { ...position };
    setIsDragging(true);
    setIsPressed(true);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (!isDragging || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    setPosition({
      x: basePosRef.current.x + dx,
      y: basePosRef.current.y + dy
    });
  };

  const endPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (buttonRef.current && buttonRef.current.hasPointerCapture(e.pointerId)) {
      buttonRef.current.releasePointerCapture(e.pointerId);
    }

    // حساب المسافة لمعرفة هل هي نقرة أم سحب
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const distance = Math.hypot(dx, dy);

      // لو الحركة صغيرة نعتبرها نقرة واحدة فقط
      if (distance < 10) {
        safeTap();
      }
    }

    dragStartRef.current = null;
    setIsDragging(false);
    setIsPressed(false);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    endPointer(e);
  };

  const handlePointerCancel: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (buttonRef.current && buttonRef.current.hasPointerCapture(e.pointerId)) {
      buttonRef.current.releasePointerCapture(e.pointerId);
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setIsPressed(false);
  };

  // منع الـ context menu على الكبسة الطويلة في الموبايل
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    el.addEventListener('contextmenu', preventContextMenu);
    return () => el.removeEventListener('contextmenu', preventContextMenu);
  }, []);

  const formattedTotal = totalCount.toLocaleString('ar-EG');
  const formattedPersonal = personalCount.toLocaleString('ar-EG');

  return (
    <div className="relative select-none">
      <button
        ref={buttonRef}
        type="button"
        className={[
          'relative z-10 rounded-full border-2 border-amber-400/40',
          'bg-gradient-to-br from-amber-500 via-amber-400 to-amber-600',
          'shadow-xl shadow-amber-900/40',
          'w-64 h-64 max-w-[80vw] max-h-[80vw]',
          'flex flex-col items-center justify-center',
          'transition-transform duration-75 ease-out',
          isPressed && !isCompleted ? 'scale-95' : 'scale-100',
          isCompleted ? 'opacity-70 cursor-default' : 'cursor-pointer'
        ].join(' ')}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0) ${
            isPressed && !isCompleted ? ' scale(0.95)' : ''
          }`
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* الحلقة العلوية */}
        <div className="absolute -top-6 w-14 h-14 rounded-full border-2 border-amber-300/50 bg-amber-100/10 flex items-center justify-center shadow-inner shadow-amber-900/40">
          <div className="w-7 h-7 rounded-full bg-amber-900/70 border border-amber-200/60" />
        </div>

        {/* نص السبح و العدادات */}
        <div className="flex flex-col items-center justify-center gap-2 mt-4">
          <span className="text-xs font-semibold text-amber-100/90 tracking-wide">
            المسبحة الجماعية
          </span>

          <div className="text-[11px] text-amber-50/80">
            مجموع الغرفة:
            <span className="font-bold ms-1 text-emerald-200">{formattedTotal}</span>
          </div>

          <div className="mt-2 px-4 py-2 rounded-full bg-black/30 border border-amber-200/40 flex flex-col items-center min-w-[120px]">
            <span className="text-[11px] text-amber-100/80 mb-1">
              عدّادك الشخصي
            </span>
            <span className="text-2xl font-extrabold text-white tabular-nums">
              {formattedPersonal}
            </span>
          </div>

          {isCompleted && (
            <div className="mt-3 text-[12px] font-bold text-emerald-100 bg-emerald-900/40 px-3 py-1 rounded-full border border-emerald-300/40">
              اكتمل الذكر في هذه الغرفة ✅
            </div>
          )}

          {!isCompleted && (
            <span className="mt-3 text-[11px] text-amber-50/80">
              اسحب المسبحة في الشاشة كما تشاء،<br />
              واضغط عليها للتسبيح مرة واحدة ✨
            </span>
          )}
        </div>
      </button>

      {/* ظل ناعم تحت المسبحة لعمق بصري */}
      {!isCompleted && (
        <div
          className="absolute w-60 h-60 rounded-full bg-amber-500/6 blur-3xl -z-10 transition-transform duration-75"
          style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        />
      )}
    </div>
  );
};
