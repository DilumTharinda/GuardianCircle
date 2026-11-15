import * as FileSystem from 'expo-file-system/legacy';

/**
 * Uploads an image URI to Cloudinary using unsigned preset.
 * Returns the secure hosted HTTPS URL.
 */
export async function uploadImageToCloudinary(imageUri) {
  if (!imageUri || imageUri.startsWith('http')) return imageUri;

  const preset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'guardiancircle_unsigned';
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'poarehfu';
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, imageUri, {
    httpMethod: 'POST',
    uploadType: 1, // MULTIPART
    fieldName: 'file',
    parameters: {
      upload_preset: String(preset),
      cloud_name: String(cloudName),
    },
  });

  const result = JSON.parse(uploadResult.body);
  if (result.secure_url) {
    return result.secure_url;
  } else {
    throw new Error(result.error?.message || 'Failed to upload image.');
  }
}

