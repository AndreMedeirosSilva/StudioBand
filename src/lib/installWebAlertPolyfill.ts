import { Alert, Platform } from 'react-native';

/**
 * `react-native-web` define `Alert.alert` como função vazia; na web o utilizador
 * não vê erros de login, validação, etc. Isto espelha o caso mais comum (título
 * + mensagem) e, com um único botão, chama `onPress` após fechar (ex.: Booking).
 */
export function installWebAlertPolyfill(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  type Btn = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Alert as any).alert = (title: string, message?: string, buttons?: Btn[]) => {
    const msg = message ?? '';
    const body = msg.length > 0 ? `${String(title)}\n\n${String(msg)}` : String(title);
    window.alert(body);
    if (buttons?.length === 1 && typeof buttons[0].onPress === 'function') {
      queueMicrotask(() => buttons[0].onPress?.());
    }
  };
}
