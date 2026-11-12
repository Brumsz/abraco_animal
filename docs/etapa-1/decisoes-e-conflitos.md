# Etapa 1 — Decisões e conflitos com a spec

Itens em que a spec conflita com boas práticas, tem lacunas ou exige uma decisão. Cada um traz uma recomendação.

## Decisões tomadas (revisão da Etapa 1)

| #   | Decisão                   | Escolha                                                                                                                                                                             |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Schema base               | Reconstruído a partir da spec (o original não estava no repositório)                                                                                                                |
| D2  | IDs                       | PK `Int` interna + `publicId UUID` exposto, gerado pelo banco (`gen_random_uuid()`)                                                                                                 |
| D3  | PSP Pix                   | **Asaas**                                                                                                                                                                           |
| D4  | Modelos extras (§10)      | **Aprovados**: Sessao, RefreshToken, Voluntario estendido, WebhookEvento, DoacaoFinanceira.anonima                                                                                  |
| D5  | Notificações              | **No 1º lançamento**: Notificacao (com `TipoNotificacao`) + DispositivoPush + sino da Home                                                                                          |
| D6  | Apadrinhamento (§9)       | **Somente animais DISPONIVEL** (animais em tratamento podem ter restrições específicas) → 422 `ANIMAL_NAO_APADRINHAVEL`                                                             |
| D7  | Idade mínima (§4)         | **18 anos**, validada no cadastro (`IDADE_MINIMA`)                                                                                                                                  |
| D8  | QR Code Pix (§11)         | **Gerado no app** a partir do `pixCopiaCola`; `pixQrCodeUrl` virou opcional e saiu do contrato                                                                                      |
| D9  | Aprovação de adoção (§13) | **Recusa automática** das demais PENDENTE do animal (`recusaAutomatica = true`) + notificação in-app, push e e-mail do tipo `ADOCAO_ANIMAL_ADOTADO` ("O <animal> encontrou um lar") |
| D10 | Prisma                    | **7.10.1** (última estável; a tag `latest` do npm aponta para 8.0.0-rc)                                                                                                             |

## Achados da validação real (Prisma 7 + Postgres 16)

- **`@default(uuid())` era gerado no cliente**, não no banco: um INSERT por SQL (seed, script, ferramenta de admin) falhava com `publicId` nulo. Trocado por `@default(dbgenerated("gen_random_uuid()"))` em todos os 19 modelos.
- **Prisma 7 tirou a `url` do `datasource`**: a conexão vai para `prisma.config.ts` (Migrate) e para o adapter `@prisma/adapter-pg` (runtime). Generator trocado para `prisma-client` com `output`.
- **`prisma migrate diff` sem `prisma.config.ts` sai com código 0 e não gera nada.** Na Etapa 2 o config entra no repositório e o CI confere se o SQL gerado não está vazio.
- Notificação guarda `tipo` + `entidadeId` em vez de uma rota livre: o app monta a navegação a partir de uma lista fechada de tipos, o que fecha o vetor de deep link malicioso vindo do servidor/push (MASVS).

## Conflitos e lacunas

### 1. Versões de bibliotecas desatualizadas

Expo Router v3, Reanimated 2 e Zustand v4 são de gerações anteriores ao Expo SDK atual. Misturá-los com o SDK mais recente gera conflitos de peer deps.
**Recomendação:** usar as versões que o SDK fixa (`npx expo install expo-router react-native-reanimated …`) e Zustand v5 (API praticamente igual).

### 2. Índice único parcial não é suportado pelo Prisma

**Solução:** SQL manual anexado à migração inicial (`apps/api/prisma/migrations/20261111222920_init`). Verificado que o Prisma não tenta removê-lo em migrações futuras. O use case também verifica antes de inserir (mensagem amigável) e o índice garante a regra sob concorrência.

### 3. Webhook do Asaas não é assinado com HMAC-SHA256

O Asaas autentica webhooks com um **token estático** no header `asaas-access-token`, não com HMAC.
**Recomendação (cumpre o objetivo "nunca confiar no status do cliente"):**

- comparar o token em tempo constante (`crypto.timingSafeEqual`);
- **reconsultar a cobrança na API do Asaas** (`GET /payments/{id}`) antes de marcar CONFIRMADA — o corpo do webhook nunca é fonte de verdade;
- deduplicar pelo id do evento (`WebhookEvento`);
- opcional: allowlist dos IPs do Asaas.
  Se HMAC for requisito inegociável, a alternativa é Mercado Pago (`x-signature`).

### 4. CPF criptografado × unicidade

AES-GCM com IV aleatório gera um texto cifrado diferente a cada gravação, então `@unique` sobre o CPF cifrado não funciona.
**Solução:** coluna `cpfHash` = HMAC-SHA256(CPF normalizado, `CPF_HMAC_KEY`) com `@unique` (_blind index_). Chave de criptografia e chave de HMAC separadas, ambas vindas de variáveis de ambiente/cofre, com versão de chave para rotação.
Consequência: dataNasc cifrada não permite consultas por idade no banco. Validar ≥ 18 anos no cadastro (D7).

### 5. Soft delete × `email @unique`

Um usuário excluído continuaria "ocupando" o e-mail. **Solução:** na exclusão LGPD, anonimizar nome, e-mail (`removido+<uuid>@anon.invalid`), telefone, endereço e campos cifrados; a FK de `Adocao.usuarioId` vira `NULL` (as adoções ficam sem vínculo nominativo, como pede a spec).

### 6. "Tooltip" em botão desabilitado

Não existe hover em touch, e botões desabilitados não recebem toque nem são anunciados de forma útil por leitores de tela.
**Recomendação:** texto auxiliar abaixo do botão ("Este animal está em tratamento e ainda não pode ser adotado") + `accessibilityHint`.

### 7. DOMPurify no servidor

Exige jsdom (pesado, superfície de ataque maior).
**Recomendação:** notícias em **Markdown**; no servidor, sanitizar o HTML renderizado com `sanitize-html` (allowlist). No app, renderizar o Markdown sem HTML bruto. Decisão final na Etapa 8.

### 8. Certificate pinning no Expo

Não funciona no Expo Go; exige development build + config plugin (ex.: `react-native-ssl-public-key-pinning`). É preciso fixar **pelo menos 2 pins** (atual + backup) e ter um plano de rotação, senão uma troca de certificado bloqueia o app inteiro.

### 9. Quais animais podem ser apadrinhados — ✅ decidido (D6)

A spec diz "mesma listagem da tab Animais" (só DISPONIVEL). Porém os animais EM_TRATAMENTO são justamente os que mais precisam de padrinho.
**Decisão:** apenas DISPONIVEL (a recomendação de incluir EM_TRATAMENTO foi recusada).

### 10. Modelos adicionais — ✅ aprovados (D4, D5)

Não estão na seção 3, mas são necessários para outras seções:

- **Sessao** + **RefreshToken** — seção 6 (rotação, família, sid/deviceId).
- **Voluntario estendido** (status, áreas, dias, turnos, motivação…) — formulário da seção 4.
- **WebhookEvento** — idempotência do webhook Pix.
- **Notificacao** + **DispositivoPush** — sino da Home e push via BullMQ. Se as notificações ficarem fora do MVP, removo o sino e esses dois modelos.
- **DoacaoFinanceira.anonima** — toggle "Doe sem identificação" (permite doador logado que não quer aparecer).

### 11. `pixQrCodeUrl` — ✅ decidido (D8)

O Asaas devolve o QR Code como **imagem base64**, não como URL. **Solução:** o app pode gerar o QR localmente a partir do `pixCopiaCola` (mais simples, sem armazenamento); a coluna fica opcional.

### 12. Distroless + Prisma

A imagem `gcr.io/distroless/nodejs22` não tem shell. Os engines do Prisma (`binaryTargets = ["native", "debian-openssl-3.0.x"]`) precisam ser copiados no estágio de build, e as migrações rodam em um job separado (não no container da API). Resolvido na Etapa 11.

### 13. Aprovação de adoção e concorrência — ✅ decidido (D9)

Ao aprovar uma adoção, as outras PENDENTE do mesmo animal são recusadas automaticamente ("Animal já adotado"), dentro de uma transação com `SELECT … FOR UPDATE` no animal. A spec não dizia isso explicitamente; confirmado, com notificação aos recusados.

### 14. Promoção a ADMIN

A spec só prevê promover a VOLUNTARIO. A promoção a ADMIN fica **fora do app** (script/seed com AuditLog), o que reduz o risco de escalonamento de privilégio.
