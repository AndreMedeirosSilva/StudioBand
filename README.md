# Estudio Banda (StudioBand)

App **Expo / React Native** para bandas marcarem ensaios e donos de estúdio gerirem agenda — com **Supabase** (Auth + Postgres + RLS) quando configurado, ou registo **local** como fallback.

**Repositório GitHub:** [github.com/AndreMedeirosSilva/StudioBand](https://github.com/AndreMedeirosSilva/StudioBand)

## Requisitos

- Node.js 20+ (recomendado)
- npm
- Para iOS/Android: ambiente [Expo](https://docs.expo.dev/get-started/installation/) conforme a plataforma

## Instalação

```bash
git clone https://github.com/AndreMedeirosSilva/StudioBand.git
cd StudioBand
npm install
```

## Variáveis de ambiente

Copia `env.example` para `.env` na raiz e preenche (o ficheiro `.env` não deve ser commitado).

- `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto Supabase  
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — chave publishable (`sb_publishable_…`)  
- Alternativa Expo: `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`

O `app.config.js` injeta estas variáveis em `expo.extra` para o bundle Metro as ler de forma fiável.

Reinicia o Metro depois de alterar o `.env`:

```bash
npx expo start
```

## Base de dados (Supabase)

As migrações SQL estão em `supabase/migrations/`: primeiro `20260329120000_estudio_banda.sql` (tabelas, RLS, convites), depois **`20260329140000_create_owned_band_rpc.sql`** (função `create_owned_band` — necessária para **criar banda** no app e no cadastro com banda).

Aplica-as por ordem no **SQL Editor** do dashboard ou com a CLI / MCP do Supabase.

Em desenvolvimento, em **Authentication → Providers → Email**, desativar confirmação de e-mail evita sessão vazia logo após o registo.

### Login com Google

1. **Google Cloud Console**: criar credenciais OAuth (tipo *Web* e, para mobile, os ecrãs de consentimento adequados).  
2. **Supabase → Authentication → Providers → Google**: ativar e colar *Client ID* e *Client Secret*.  
3. **Supabase → Authentication → URL Configuration → Redirect URLs**: adicionar `estudiobanda://auth/callback` e o URL da app web (ex.: `http://localhost:8081/` em desenvolvimento).

O esquema de URL `estudiobanda` está definido em `app.json` (`scheme`).

## Scripts

| Comando | Descrição |
|--------|-----------|
| `npm start` | Metro / Expo |
| `npm run web` | Alvo web |
| `npm run android` | Android |
| `npm run ios` | iOS |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |

## CI (GitHub Actions)

No push e pull request para `main`, corre instalação limpa e `typecheck`. Não é necessário `.env` no CI (o typecheck não executa o Supabase em runtime).

## Deploy (resumo)

- **Web:** `npx expo export --platform web` (ou fluxo documentado na versão do Expo em uso) e hospedar os ficheiros estáticos (ex.: Netlify, Vercel, GitHub Pages com ajuste de base URL).  
- **Lojas (iOS/Android):** [EAS Build / Submit](https://docs.expo.dev/build/introduction/) — criar conta Expo, `npm install -g eas-cli`, `eas login`, `eas build:configure`.

## Licença

Privado / uso do autor, salvo indicação em contrário nos ficheiros do repositório.
