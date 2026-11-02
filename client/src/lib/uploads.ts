/**
 * Photos for equipment reports (Fig 13c, 15) and guardian consent documents (Scope: members under 18).
 * The member takes a photo or picks one, it is shrunk to about 1280 px, and uploaded to a private
 * Supabase Storage bucket under "<user id>/…", which the storage policies use to check ownership.
 * Staff, instructors and the owner view private files through short-lived signed links.
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import { uuid } from "./attendance";

export type Bucket = "equipment-photos" | "consent-docs";
export type Photo = { uri: string; base64: string };

/** Opens the camera (or the photo library). Returns null if the person cancels. */
export async function pickPhoto({ camera }: { camera: boolean }): Promise<Photo | null> {
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Allow camera access to take a photo, or choose one from your gallery.");
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const res = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const resize = (asset.width ?? 0) > 1280 ? [{ resize: { width: 1280 } }] : [];
  const out = await ImageManipulator.manipulateAsync(asset.uri, resize, {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not read the photo. Try another one.");
  return { uri: out.uri, base64: out.base64 };
}

function toBytes(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Uploads to "<bucket>/<my user id>/<random>.jpg" and returns that path (saved with the report or consent). */
export async function uploadPhoto(bucket: Bucket, photo: Photo): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) throw new Error("Sign in again to upload photos.");
  const path = `${me}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, toBytes(photo.base64), {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

/** A link that works for 10 minutes, for people allowed to see the file. */
export async function signedUrl(bucket: Bucket, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}
