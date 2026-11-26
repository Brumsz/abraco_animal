# Etapa 11d — Push e Sentry no app

## Dependências novas (versões da tabela do Expo SDK 58, `bundledNativeModules.json`)

| Pacote                 | Por quê                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `expo-notifications`   | Permissão, token da Expo, canal Android e toque na notificação                       |
| `expo-device`          | Push só funciona em aparelho físico: no emulador o app nem tenta                     |
| `expo-dev-client`      | Development build (perfil `development` do EAS) — o push **não** funciona no Expo Go |
| `expo-updates`         | Atualização OTA pelos canais do EAS (`runtimeVersion: appVersion`)                   |
| `@sentry/react-native` | Erros do app (spec: Sentry)                                                          |

O script de instalação do `@sentry/cli` (baixa um binário para enviar source maps) ficou
**bloqueado** pelo pnpm — padrão mais seguro. Sem ele não há upload de source maps, o que
também atende a spec ("desativar source maps em produção").

## Push

- **Quando pergunta a permissão:** na primeira entrada depois do login. Quem desligou nas
  Configurações não é perguntado de novo.
- **Configurações → Notificações → "Avisos no celular":** liga/desliga só este aparelho
  (`POST`/`DELETE /v1/me/dispositivos-push`). Bloqueado no sistema → abre as configurações do
  celular. No Expo Go/emulador → explica que precisa do app instalado.
- **Toque na notificação (seção 6: validar payloads de push):** o payload é validado com Zod e
  só o `tipo` escolhe a tela, numa tabela fixa (adoções, doações, voluntariado, chat, sino).
  Nenhum endereço vem do payload; qualquer coisa fora do formato abre o sino.
- **App aberto:** a notificação aparece como banner e o sino atualiza.
- Canal Android `padrao` (o mesmo que a API envia).

## Sentry no app

- Desligado sem `EXPO_PUBLIC_SENTRY_DSN` e **sempre em desenvolvimento**.
- Sem captura de tela, sem hierarquia de views (nem `accessibilityIdentifier`), sem usuário,
  sem breadcrumbs do console, sem rastreamento de desempenho (cota gratuita).
- `beforeSend` redige e-mail, CPF, JWT, `Bearer` e token de push; URLs sem query.

## Para testar o push de verdade (tudo gratuito)

1. Conta em expo.dev; em `apps/mobile`: `npx eas-cli init` (grava o `projectId`).
2. Android: criar projeto no Firebase (grátis), baixar a chave de conta de serviço e enviar com
   `npx eas-cli credentials` (FCM V1).
3. `npx eas-cli build --profile development --platform android` → instalar o APK no celular.
4. `pnpm --filter @abraco/mobile exec expo start --dev-client` e abrir pelo app instalado.
5. Aprovar uma adoção como admin → o push chega em até ~10 s.

## Variáveis novas

`EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_AMBIENTE` (em `apps/mobile/.env.example` e no da raiz).
