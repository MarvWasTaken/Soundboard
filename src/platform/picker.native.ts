import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { PickedFile } from './contracts.ts';
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { name: asset.name, size: asset.size ?? new File(asset.uri).size, mimeType: asset.mimeType ?? '', source: asset.uri };
}
