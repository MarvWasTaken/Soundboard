import type { PickedFile } from './contracts.ts';
export function pickFile(): Promise<PickedFile | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*,.mp3,.wav';
    input.setAttribute('aria-label', 'Audiodatei auswählen');
    input.style.display = 'none'; document.body.appendChild(input);
    const finish = (file?: File) => {
      input.remove(); resolve(file ? { name: file.name, size: file.size, mimeType: file.type, source: file } : null);
    };
    input.onchange = () => finish(input.files?.[0]);
    input.oncancel = () => finish(); input.click();
  });
}
