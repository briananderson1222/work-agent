import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileAttachment } from '../types';

interface UseFileAttachmentOptions {
  onAdd: (files: FileAttachment[]) => void;
}

export function useFileAttachment({ onAdd }: UseFileAttachmentOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const showMenu = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowPreview(true);
  }, []);

  const hideMenu = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowPreview(false);
    }, 150);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const newAttachments: FileAttachment[] = [];

      for (const file of files) {
        const reader = new FileReader();
        const attachment = await new Promise<FileAttachment>((resolve) => {
          reader.onload = () => {
            const base64 = reader.result as string;
            const isImage = file.type.startsWith('image/');

            resolve({
              id: `${Date.now()}-${Math.random()}`,
              name: file.name,
              type: file.type,
              size: file.size,
              data: base64,
              preview: isImage ? base64 : undefined,
            });
          };
          reader.readAsDataURL(file);
        });

        newAttachments.push(attachment);
      }

      onAdd(newAttachments);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setTimeout(() => attachButtonRef.current?.focus(), 0);
    },
    [onAdd],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const closePreviewImage = useCallback(() => {
    setPreviewImage(null);
    attachButtonRef.current?.focus();
  }, []);

  return {
    fileInputRef,
    attachButtonRef,
    showPreview,
    setShowPreview,
    previewImage,
    setPreviewImage,
    showMenu,
    hideMenu,
    handleFileSelect,
    openFilePicker,
    closePreviewImage,
  };
}
