const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * Compresses and uploads an image to Cloudinary.
 * @param {string} localUri - The local file URI from expo-image-picker or expo-camera
 * @param {string} folder - Sub-folder within Cloudinary (e.g., 'lost-items', 'profiles')
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadImage(localUri, folder = 'general') {
  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    type: 'image/jpeg',
    name: `upload_${Date.now()}.jpg`,
  });
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `guardiancircle/${folder}`);
  // Quality transformation to stay within free-tier bandwidth
  formData.append('transformation', 'q_auto:eco,w_800,c_limit');

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Cloudinary upload failed: ${errorData.error?.message}`);
  }

  const data = await response.json();
  return {
    url: data.secure_url,
    publicId: data.public_id,
  };
}