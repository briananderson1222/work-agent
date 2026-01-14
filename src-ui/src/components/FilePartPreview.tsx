import { usePreview } from '../contexts/PreviewContext';

interface FilePart {
  type: string;
  url?: string;
  mediaType?: string;
  name?: string;
}

interface FilePartPreviewProps {
  part: FilePart;
  allParts?: FilePart[];
}

export function FilePartPreview({ part, allParts }: FilePartPreviewProps) {
  const { openPreview } = usePreview();
  
  if (part.type !== 'file' || !part.url) return null;
  
  const canPreview = part.mediaType?.startsWith('image/');
  const fileName = part.name || 'Attachment';
  const allPreviewable = (allParts || [])
    .filter(p => p.type === 'file' && p.url && p.mediaType?.startsWith('image/'))
    .map(p => ({ url: p.url!, mediaType: p.mediaType!, name: p.name }));

  const handleClick = canPreview 
    ? () => openPreview({ url: part.url!, mediaType: part.mediaType!, name: fileName }, allPreviewable)
    : undefined;

  return (
    <div 
      className={`file-part-preview ${canPreview ? 'file-part-preview--clickable' : ''}`}
      onClick={handleClick}
    >
      {canPreview ? (
        <img src={part.url} alt={fileName} className="file-part-preview__thumbnail" />
      ) : (
        <div className="file-part-preview__icon">📄</div>
      )}
      <div className="file-part-preview__info">
        <div className="file-part-preview__name">{fileName}</div>
        <div className="file-part-preview__type">{part.mediaType}</div>
      </div>
    </div>
  );
}
