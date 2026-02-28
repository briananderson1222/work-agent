import { useEffect } from 'react';

interface UseDragResizeOptions {
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  setHeight: (value: number) => void;
  minHeight?: number;
  maxHeightOffset?: number;
}

export function useDragResize({
  isDragging,
  setIsDragging,
  setHeight,
  minHeight = 200,
  maxHeightOffset = 150,
}: UseDragResizeOptions) {
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setHeight(
        Math.max(
          minHeight,
          Math.min(newHeight, window.innerHeight - maxHeightOffset),
        ),
      );
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setIsDragging, setHeight, minHeight, maxHeightOffset]);
}
