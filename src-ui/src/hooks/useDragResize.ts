import { useEffect } from 'react';

interface UseDragResizeOptions {
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  setHeight: (value: number) => void;
  setWidth?: (value: number) => void;
  direction?: 'vertical' | 'horizontal';
  minHeight?: number;
  maxHeightOffset?: number;
  minWidth?: number;
  maxWidthPercent?: number;
}

export function useDragResize({
  isDragging,
  setIsDragging,
  setHeight,
  setWidth,
  direction = 'vertical',
  minHeight = 200,
  maxHeightOffset = 150,
  minWidth = 280,
  maxWidthPercent = 0.6,
}: UseDragResizeOptions) {
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (direction === 'horizontal' && setWidth) {
        const newWidth = window.innerWidth - e.clientX;
        setWidth(
          Math.max(
            minWidth,
            Math.min(newWidth, window.innerWidth * maxWidthPercent),
          ),
        );
      } else {
        const newHeight = window.innerHeight - e.clientY;
        setHeight(
          Math.max(
            minHeight,
            Math.min(newHeight, window.innerHeight - maxHeightOffset),
          ),
        );
      }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      handleMouseMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    };
    const handleTouchEnd = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [
    isDragging,
    setIsDragging,
    setHeight,
    setWidth,
    direction,
    minHeight,
    maxHeightOffset,
    minWidth,
    maxWidthPercent,
  ]);
}
