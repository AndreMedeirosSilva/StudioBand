import * as Clipboard from 'expo-clipboard';

export function setStringAsync(
  text: string,
  options?: Parameters<typeof Clipboard.setStringAsync>[1],
): ReturnType<typeof Clipboard.setStringAsync> {
  return Clipboard.setStringAsync(text, options ?? {});
}
