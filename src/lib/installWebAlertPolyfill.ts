import { Alert, Platform } from 'react-native';

/**
 * `react-native-web` define `Alert.alert` como função vazia; na web o utilizador
 * não vê erros de login, validação, etc.
 *
 * Aqui substituímos por um modal visual customizado com tema da app.
 */
export function installWebAlertPolyfill(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  type Btn = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
  type AlertPayload = { title: string; message?: string; buttons?: Btn[] };

  const queue: AlertPayload[] = [];
  let active = false;
  let stylesInjected = false;

  const injectStyles = () => {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .sb-alert-overlay {
        position: fixed;
        inset: 0;
        background: rgba(8, 6, 14, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 99999;
        backdrop-filter: blur(2px);
      }
      .sb-alert-card {
        width: min(92vw, 420px);
        background: #18121f;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        box-shadow: 0 18px 48px rgba(0,0,0,0.45);
        padding: 18px;
        color: #f8fafc;
        font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      .sb-alert-title {
        margin: 0;
        font-size: 18px;
        line-height: 1.35;
        font-weight: 800;
        color: #f8fafc;
      }
      .sb-alert-message {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.55;
        color: #cbd5e1;
        white-space: pre-wrap;
      }
      .sb-alert-actions {
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }
      .sb-alert-btn {
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 10px;
        background: #211a2c;
        color: #f8fafc;
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
      }
      .sb-alert-btn:hover { opacity: 0.94; }
      .sb-alert-btn:active { transform: scale(0.98); }
      .sb-alert-btn--cancel {
        background: #15111d;
        border-color: rgba(255,255,255,0.16);
        color: #cbd5e1;
      }
      .sb-alert-btn--destructive {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fecaca;
      }
      .sb-alert-btn--primary {
        background: #ffbe98;
        border-color: #ffbe98;
        color: #2b1308;
      }
    `;
    document.head.appendChild(style);
  };

  const showNext = () => {
    if (active || queue.length === 0 || typeof document === 'undefined') return;
    active = true;
    injectStyles();

    const current = queue.shift() as AlertPayload;
    const buttons = current.buttons && current.buttons.length > 0 ? current.buttons : [{ text: 'OK', style: 'default' as const }];

    const overlay = document.createElement('div');
    overlay.className = 'sb-alert-overlay';

    const card = document.createElement('div');
    card.className = 'sb-alert-card';

    const title = document.createElement('h3');
    title.className = 'sb-alert-title';
    title.textContent = String(current.title ?? '');
    card.appendChild(title);

    if (typeof current.message === 'string' && current.message.trim().length > 0) {
      const message = document.createElement('p');
      message.className = 'sb-alert-message';
      message.textContent = current.message;
      card.appendChild(message);
    }

    const actions = document.createElement('div');
    actions.className = 'sb-alert-actions';

    const closeAndContinue = (onPress?: () => void) => {
      overlay.remove();
      active = false;
      if (typeof onPress === 'function') {
        queueMicrotask(() => onPress());
      }
      queueMicrotask(showNext);
    };

    buttons.forEach((btn, idx) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'sb-alert-btn';
      if (btn.style === 'cancel') {
        el.className += ' sb-alert-btn--cancel';
      } else if (btn.style === 'destructive') {
        el.className += ' sb-alert-btn--destructive';
      } else if (idx === buttons.length - 1) {
        el.className += ' sb-alert-btn--primary';
      }
      el.textContent = btn.text?.trim() || (idx === buttons.length - 1 ? 'OK' : 'Cancelar');
      el.onclick = () => closeAndContinue(btn.onPress);
      actions.appendChild(el);
    });

    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Alert as any).alert = (title: string, message?: string, buttons?: Btn[]) => {
    queue.push({ title: String(title ?? ''), message, buttons });
    showNext();
  };
}
