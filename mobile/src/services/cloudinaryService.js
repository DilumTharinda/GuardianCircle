const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'poarehfu';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'guardiancircle_unsigned';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * Uploads an image to Cloudinary.
 * Supports:
 *  1. Base64 data strings (e.g. data:image/jpeg;base64,...) via direct JSON payload (no FormData required)
 *  2. Local file URIs (file:/// or content://) via FileReader base64 conversion or native XMLHttpRequest
 *
 * @param {string} imageInput - Base64 data URL or local file URI
 * @param {string} folder - Sub-folder within Cloudinary (e.g. 'lost-items', 'found-items')
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadImage(imageInput, folder = 'general') {
  if (!imageInput) {
    throw new Error('No image provided for upload');
  }

  const targetFolder = `guardiancircle/${folder}`;

  // 1. If imageInput is already a Base64 string or data URI, upload directly via JSON
  if (
    typeof imageInput === 'string' &&
    (imageInput.startsWith('data:') || imageInput.length > 500 && !imageInput.startsWith('file:') && !imageInput.startsWith('content:') && !imageInput.startsWith('http'))
  ) {
    const dataUri = imageInput.startsWith('data:') ? imageInput : `data:image/jpeg;base64,${imageInput}`;
    return uploadViaJson(dataUri, targetFolder);
  }

  // 2. If it is a local file URI (e.g. file:/// or content://), convert to Base64 via Blob & FileReader
  if (typeof imageInput === 'string' && (imageInput.startsWith('file:') || imageInput.startsWith('content:'))) {
    try {
      const dataUri = await convertUriToBase64(imageInput);
      if (dataUri) {
        return await uploadViaJson(dataUri, targetFolder);
      }
    } catch (e) {
      console.warn('[cloudinaryService] Blob conversion fallback to XHR:', e?.message);
    }

    // 3. Fallback: upload via native XMLHttpRequest (bypasses Expo WinterCG fetch convertFormDataAsync)
    return uploadViaXhr(imageInput, targetFolder);
  }

  // 4. Default JSON upload attempt
  return uploadViaJson(imageInput, targetFolder);
}

/**
 * Direct JSON upload using Base64 data URI (Works 100% reliably in all environments)
 */
async function uploadViaJson(base64Data, targetFolder) {
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      file: base64Data,
      upload_preset: UPLOAD_PRESET,
      folder: targetFolder,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: data.secure_url || data.url,
    publicId: data.public_id,
  };
}

/**
 * Convert local file URI to Base64 Data URL using fetch and FileReader
 */
async function convertUriToBase64(uri) {
  const res = await fetch(uri);
  const blob = await res.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result);
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Native XMLHttpRequest upload (bypasses Expo 58 WinterCG convertFormDataAsync error)
 */
function uploadViaXhr(localUri, targetFolder) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve({
            url: res.secure_url || res.url,
            publicId: res.public_id,
          });
        } catch (e) {
          reject(new Error('Failed to parse Cloudinary response'));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error?.message || `Upload failed with status ${xhr.status}`));
        } catch (_) {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during image upload'));
    };

    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      type: 'image/jpeg',
      name: `upload_${Date.now()}.jpg`,
    });
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', targetFolder);

    xhr.send(formData);
  });
}
