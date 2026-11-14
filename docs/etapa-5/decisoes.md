# Etapa 5 — Adoções e notificações

## Arquitetura

```
modules/adocoes/domain/          triagem, recusa, IDOR, autoaprovação, linha do tempo
modules/adocoes/application/     solicitar, minhas, obter, admin (listar, obter, aprovar, recusar)
modules/adocoes/infrastructure/  repositório Prisma: aprovação inteira numa transação
modules/adocoes/http/            rotas /adocoes, /me/adocoes, /admin/adocoes

modules/notificacoes/            sino da Home: listar, contar não lidas, marcar lida(s)

shared/dominio/permissoes.ts     Ator + exigirRole/exigirAdmin (role validada no caso de uso)
shared/aplicacao/emails-adocao.ts   porta dos 4 e-mails da adoção
shared/aplicacao/notificacoes.ts    conteúdo de notificação
shared/infra/auditoria-prisma.ts    AuditLog dentro da transação (animais e adoções)
shared/http/limite.ts               rate limit por regra (auth e adoções)
```

## Rotas

| Rota                                  | Acesso        | Observação                                                      |
| ------------------------------------- | ------------- | --------------------------------------------------------------- |
| `POST /v1/adocoes`                    | logado        | Triagem → PENDENTE + e-mail de confirmação. 10/hora por usuário |
| `GET /v1/me/adocoes`                  | logado        | O filtro vem do token: impossível listar as de outra pessoa     |
| `GET /v1/adocoes/{id}`                | dono ou ADMIN | Outro usuário (inclusive VOLUNTARIO) → **403** (IDOR)           |
| `GET /v1/admin/adocoes`               | ADMIN         | Filtros: status, animal, período (`de` ≤ criadoEm < `ate`)      |
| `GET /v1/admin/adocoes/{id}`          | ADMIN         | Triagem + contato e endereço do solicitante                     |
| `POST /v1/admin/adocoes/{id}/aprovar` | ADMIN         | Ver "Aprovação"                                                 |
| `POST /v1/admin/adocoes/{id}/recusar` | ADMIN         | `motivoRecusa` de 10 a 1000 caracteres                          |
| `GET /v1/notificacoes`                | logado        | Mais recentes primeiro, paginado                                |
| `GET /v1/notificacoes/nao-lidas`      | logado        | Badge do sino                                                   |
| `POST /v1/notificacoes/{id}/lida`     | logado        | Idempotente; de outra pessoa → 404                              |
| `POST /v1/notificacoes/lidas`         | logado        | Marca todas                                                     |

## Aprovação

Uma única transação, nesta ordem:

1. Animal `DISPONIVEL → ADOTADO` com `UPDATE … WHERE status = 'DISPONIVEL'`. Isso **trava a linha do animal**.
2. Esta adoção `PENDENTE → APROVADA`.
3. As demais `PENDENTE` do animal → `RECUSADA` com `recusaAutomatica = true` e uma mensagem
   gentil ("o animal foi adotado por outra família…").
4. Notificação `ADOCAO_APROVADA` para o adotante e `ADOCAO_ANIMAL_ADOTADO` para cada encerrado.
5. AuditLog `ADOCAO_APROVADA` com os ids encerrados.

Depois do commit saem os e-mails: aprovada para o adotante e encerrada para cada um dos outros.

| Situação                                                                  | Resultado                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duas admins aprovam pedidos **diferentes** do mesmo animal ao mesmo tempo | A segunda espera a trava do passo 1 e encontra o animal ADOTADO → 409. Testado com requisições simultâneas reais                                                                                            |
| Alguém pede o animal no exato instante da aprovação                       | A criação lê o animal com `SELECT … FOR SHARE`: espera a aprovação terminar e recebe 409. Sem isso, a solicitação nova ficaria PENDENTE para um animal já adotado (a aprovação não a enxergaria no passo 3) |
| Mesmo usuário envia o formulário 5 vezes de uma vez (toque duplo)         | O índice único parcial `adocoes_pendente_unica` deixa entrar só uma; as outras → 409. Testado                                                                                                               |
| Animal saiu de DISPONIVEL depois do pedido                                | Aprovação → 409 `ANIMAL_NAO_DISPONIVEL`; o pedido continua pendente para o admin decidir                                                                                                                    |
| Remover um animal com adoções pendentes                                   | 409 `ANIMAL_COM_ADOCOES_PENDENTES` (antes ficariam sem resposta). A remoção trava o animal antes de contar, pela mesma razão do FOR SHARE                                                                   |

## Decisões

| Tema                    | Decisão                                                                                                      | Motivo                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Role no caso de uso     | Todo caso de uso recebe o `Ator` e valida a role (`exigirAdmin`); os de animais (Etapa 4) foram ajustados    | Seção 5: "validar role no use case, não apenas no controller". Testado chamando os casos de uso direto |
| Autoaprovação           | Admin que pediu a adoção não a aprova (403 `AUTOAPROVACAO_PROIBIDA`); outra pessoa da equipe aprova          | Seção 5 (conflito de interesse). Recusar a própria é permitido                                         |
| IDOR                    | 403 para quem não é dono nem ADMIN, como pede a spec                                                         | O id é UUID aleatório, então o 403 não permite varrer ids. Notificação alheia → 404                    |
| CPF no detalhe do admin | Não aparece: só nome, e-mail, telefone e endereço                                                            | Minimização (LGPD): é o que basta para analisar e visitar                                              |
| Texto das notificações  | Só o nome do animal; o motivo da recusa fica no detalhe e no e-mail                                          | Push (Etapa 10) aparece na tela bloqueada                                                              |
| Auditoria da recusa     | Guarda o fato e o animal, não o texto do motivo                                                              | Texto livre pode conter dado pessoal                                                                   |
| E-mail × transação      | E-mails enfileirados **depois** do commit; falha ao enfileirar é registrada (só o tipo do erro) e não desfaz | Devolver erro faria o app repetir uma ação que já aconteceu; a notificação no app já está gravada      |
| Linha do tempo          | Enviada → Em análise (começa no envio) → Aprovada/Recusada                                                   | Seção 4. Não há etapa intermediária real a registrar                                                   |
| Rate limit              | 10 solicitações por hora **por usuário** (chave = hash do id)                                                | Seção 6                                                                                                |
| Notificações push       | Ficam para a Etapa 10 (registro de aparelho no app). Notificação no app e e-mail já funcionam                | O app ainda não registra o token Expo                                                                  |
| E-mails HTML            | Todo texto livre (nome, animal, motivo) passa por escape de HTML                                             | O nome do animal e o motivo são digitados; testado com `<script>` e link de phishing                   |

## Testes

| Tipo                                  | Quantidade                            |
| ------------------------------------- | ------------------------------------- |
| Unitários da API (todos os módulos)   | 196                                   |
| Integração (auth + animais + adoções) | 62 (17 novos de adoção e notificação) |

Cobertura de domínio + casos de uso: **98,6% linhas / 94,2% ramos** (meta 85%).

Checklist da seção 9 que esta etapa fecha:

| Item                                                             | Situação                      |
| ---------------------------------------------------------------- | ----------------------------- |
| Fluxo completo de adoção: criar → admin aprovar → animal ADOTADO | ✅ integração                 |
| IDOR: usuário A tenta ver adoção do usuário B → 403              | ✅ unitário e integração      |
| Usuário comum em `/admin/*` → 403                                | ✅ também nas rotas de adoção |
| Entidade Adocao (unitário)                                       | ✅                            |

Fumaça no docker-compose: 2 pedidos, IDOR → 403, aprovação, encerramento automático, sino com 1
notificação para cada um e os 4 e-mails entregues no Mailpit. Os logs não têm e-mail, senha
nem token.
