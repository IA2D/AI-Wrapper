import { ImageAttachment, generateId } from '../types';

/**
 * Validates that the file is one of the supported image types
 * Supported types: JPEG, PNG, GIF, WEBP
 */
export function validateImageType(file: File): { valid: boolean; error?: string } {
  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!validMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported image format. Supported formats: JPEG, PNG, GIF, WEBP',
    };
  }
  
  return { valid: true };
}

/**
 * Validates that the file size does not exceed 10MB
 */
export function validateImageSize(file: File): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Image size exceeds 10MB limit. File size: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }
  
  return { valid: true };
}

/**
 * Converts a File object to a base64-encoded data URL
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${reader.error?.message || 'Unknown error'}`));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image file to the server and returns the URL
 * Throws an error if upload fails
 */
export async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload image');
  }

  const data = await response.json();
  return data.url;
}

/**
 * Processes an image file by validating type and size, uploading to server, then creating ImageAttachment
 * Throws an error if validation or upload fails
 */
export async function processImageFile(file: File): Promise<ImageAttachment> {
  // Validate image type
  const typeValidation = validateImageType(file);
  if (!typeValidation.valid) {
    throw new Error(typeValidation.error);
  }
  
  // Validate image size
  const sizeValidation = validateImageSize(file);
  if (!sizeValidation.valid) {
    throw new Error(sizeValidation.error);
  }
  
  // Upload to server and get URL
  const imageUrl = await uploadImageFile(file);
  
  // Create ImageAttachment object
  const attachment: ImageAttachment = {
    id: generateId(),
    name: file.name,
    url: imageUrl,
    mimeType: file.type,
    size: file.size,
  };
  
  return attachment;
}
