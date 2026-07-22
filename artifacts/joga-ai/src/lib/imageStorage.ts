/**
 * Upload de imagens para Firebase Storage (avatars, capas de comunidade).
 */

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import app, { isFirebaseConfigured } from "./firebase";
import { compressBlobForStorage } from "./imageUtils";

function storage() {
  return getStorage(app);
}

/** Extrai o path Storage a partir de uma download URL do Firebase. */
export function extractStoragePathFromUrl(url?: string): string | null {
  if (!url || !url.includes("firebasestorage.googleapis.com")) return null;
  try {
    const match = url.match(/\/o\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function deleteImage(path: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await deleteObject(ref(storage(), path));
  } catch (err) {
    console.warn("[imageStorage] delete failed:", path, err);
  }
}

export async function deleteImageByUrl(url?: string): Promise<void> {
  const path = extractStoragePathFromUrl(url);
  if (path) await deleteImage(path);
}

export async function uploadImage(
  storagePath: string,
  file: Blob | File | string,
): Promise<string> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase Storage não configurado");
  }
  const blob = await compressBlobForStorage(file);
  const storageRef = ref(storage(), storagePath);
  await uploadBytes(storageRef, blob, { contentType: "image/webp" });
  return getDownloadURL(storageRef);
}

export async function uploadUserAvatar(
  userId: string,
  file: Blob | File | string,
): Promise<string> {
  return uploadImage(`users/${userId}/avatar/${Date.now()}.webp`, file);
}

export async function uploadCommunityCover(
  communityId: string,
  file: Blob | File | string,
): Promise<string> {
  return uploadImage(`communities/${communityId}/cover/${Date.now()}.webp`, file);
}

export async function uploadCommunityCrest(
  communityId: string,
  file: Blob | File | string,
): Promise<string> {
  return uploadImage(`communities/${communityId}/crest/${Date.now()}.webp`, file);
}

export async function uploadFieldPhoto(
  key: "futsal" | "f5" | "f7",
  file: Blob | File | string,
): Promise<string> {
  return uploadImage(`app/fieldPhotos/${key}.webp`, file);
}
