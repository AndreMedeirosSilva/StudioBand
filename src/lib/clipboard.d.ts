/** Web: `navigator.clipboard`. Native: `expo-clipboard` (evita Metro resolver `./Utils` no pacote). */
export function setStringAsync(text: string, options?: { inputFormat?: string }): Promise<boolean>;
