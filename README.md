# Estudio Banda

Aplicação **Expo / React Native** para **bandas** e **estúdios**: marcar ensaios, gerir disponibilidade de salas e convidar membros com códigos de convite. Interface pensada para web e dispositivos móveis.

## O que o projeto faz

- Conta e sessão do utilizador  
- Criação de banda e entrada por convite  
- Fluxo para reservar ensaios e ver disponibilidade  
- Área para donos de estúdio gerirem agenda e reservas (quando aplicável)

## Requisitos

- [Node.js](https://nodejs.org/) 20 ou superior (recomendado)  
- [npm](https://www.npmjs.com/)  
- Para iOS/Android: ambiente [Expo](https://docs.expo.dev/get-started/installation/) conforme a plataforma

## Como executar

```bash
git clone <url-do-repositório>
cd <pasta-do-projeto>
npm install
npx expo start
```

- `npm start` — Metro / Expo  
- `npm run web` — alvo web  
- `npm run android` / `npm run ios` — dispositivos ou emuladores  
- `npm run typecheck` — verificação TypeScript  

Configuração sensível (URLs e chaves de serviços) fica em ficheiros locais não versionados; usa `env.example` como modelo, se existir.

## Repositório

Código e histórico: [github.com/AndreMedeirosSilva/StudioBand](https://github.com/AndreMedeirosSilva/StudioBand)

Ramo principal: **`master`**. Alterações podem ser propostas via *pull request* para `master`.

## Licença

Uso privado do autor, salvo indicação em contrário nos ficheiros do repositório.
