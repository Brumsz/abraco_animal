# Etapa 11c — Notificações push (API)

O app (permissão, token, toque na notificação) entra no 11d. Nenhuma dependência nova:
o Expo Push Service é um POST JSON (fetch nativo) e a fila já é BullMQ.

## Como funciona (outbox)

1. Cada módulo já grava a notificação do sino **na mesma transação** da alteração
   (adoção aprovada, nova mensagem…). Nada mudou neles.
2. Um job do BullMQ roda a cada 10 s (uma execução por vez no cluster todo) e
   **reserva** as notificações com `pushEnviadoEm IS NULL` usando
   `FOR UPDATE SKIP LOCKED` — duas instâncias nunca pegam a mesma.
3. Envia aos aparelhos do dono pelo Expo Push (lotes de 100) e apaga tokens que a Expo
   diz não existirem mais (`DeviceNotRegistered`).

## Decisões

| Tema                     | Decisão                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quem recebe              | Só aparelhos com **sessão ativa** no mesmo `deviceId` (não revogada, usada nos últimos 30 dias). Logout, troca de senha, conta desativada/excluída cortam o push sozinhos |
| Entrega                  | No máximo uma vez: marca antes de enviar. Se a Expo cair, a notificação continua no sino (nada some)                                                                      |
| Notificação antiga       | Mais de 6 h: marcada sem push (API ficou fora do ar; não faz sentido avisar agora)                                                                                        |
| O que já existia         | A migração marca as notificações antigas como enviadas: ninguém recebe push de coisa velha                                                                                |
| Aparelho trocou de conta | O token é do aparelho: registrar numa conta tira o token da conta anterior                                                                                                |
| Conteúdo                 | Título e corpo da notificação do sino, que já não têm dado pessoal (aparecem na tela bloqueada). `data` leva só `notificacaoId`, `tipo` e `entidadeId`                    |
| Token inválido           | Só `ExponentPushToken[…]`/`ExpoPushToken[…]` (422 `TOKEN_PUSH_INVALIDO`)                                                                                                  |
| `EXPO_ACCESS_TOKEN`      | Opcional; só se a conta Expo ligar "Enhanced Security for Push"                                                                                                           |
| Android                  | Canal `padrao` (o app cria no 11d). FCM é configurado no EAS (`eas credentials`), grátis                                                                                  |

## Rotas

| Rota                                        | O que faz                                      |
| ------------------------------------------- | ---------------------------------------------- |
| `POST /v1/me/dispositivos-push`             | Registra `{ deviceId, expoToken }` (204)       |
| `DELETE /v1/me/dispositivos-push/:deviceId` | Remove (pessoa desligou as notificações) (204) |

## Melhoria futura (não feita)

Recibos da Expo (`/getReceipts`, ~15 min depois) para detectar `DeviceNotRegistered` que só
aparece no recibo. Hoje só os erros imediatos do ticket apagam tokens.

## Testes

Unidade: casos de uso (registro, despacho, tokens inválidos, notificação antiga, Expo fora,
lotes de 100) e cliente Expo. Integração (Postgres real, na CI): entrega única, 401/422,
logout corta o push, aparelho passa para a última conta, remoção.
