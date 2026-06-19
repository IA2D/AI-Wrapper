import { FileAttachment as FileAttachmentType, ImageAttachment } from '@/types';

interface FileAttachmentProps {
  attachment: FileAttachmentType | ImageAttachment;
}

export default function FileAttachment({ attachment }: FileAttachmentProps) {
  const { url, name, mimeType } = attachment;
  
  // Determine type from mimeType if 'type' field doesn't exist (ImageAttachment)
  const type = 'type' in attachment ? attachment.type : 
    mimeType.startsWith('image/') ? 'image' : 'document';

  // Image: Display thumbnail using object URL or base64
  if (type === 'image') {
    return (
      <div className="inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <img
          src={url}
          alt={name}
          className="max-w-[200px] max-h-[200px] object-contain bg-gray-50"
          loading="lazy"
        />
      </div>
    );
  }

  // Video: Show video icon with filename
  if (type === 'video') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg max-w-xs">
        <svg
          className="w-6 h-6 text-blue-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm text-blue-900 truncate">{name}</span>
      </div>
    );
  }

  // Document: Show document icon with filename
  if (type === 'document') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg max-w-xs">
        <svg
          className="w-6 h-6 text-gray-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span className="text-sm text-gray-900 truncate">{name}</span>
      </div>
    );
  }

  return null;
}
