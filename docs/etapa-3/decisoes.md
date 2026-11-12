# Etapa 3 — Autenticação

## Arquitetura do módulo

```
modules/usuarios/domain/        Cpf, Email, Telefone, política de senha, idade mínima (18)
modules/auth/application/       portas + casos de uso (cadastro, login, renovar, logout,
                                recuperação em 3 passos) — sem Fastify/Prisma/Redis
modules/auth/infrastructure/    Argon2id, AES-256-GCM, HMAC, JWT EdDSA, Prisma, Redis
modules/auth/http/              rotas, esquemas Zod estritos, guard de autenticação/role
composicao.ts                   composition root (injeta implementações nos casos de uso)
```

## Decisões

| Tema                            | Decisão                                                                                                                                                                                                  | Motivo                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| JWT                             | `fast-jwt` direto em vez do plugin `@fastify/jwt`                                                                                                                                                        | É o mesmo motor do plugin; o adaptador fica independente do Fastify (seção 8) e testável sem servidor                          |
| Hash dos códigos de recuperação | **HMAC**-SHA256 com chave própria (`CODIGOS_HMAC_KEY_B64`)                                                                                                                                               | Um código de 6 dígitos tem só 1 milhão de valores: SHA-256 puro seria revertido por força bruta em segundos se o banco vazasse |
| Refresh token                   | 256 bits aleatórios, SHA-256 no banco, vinculado a `sid` + `deviceId`                                                                                                                                    | Seção 6. Refresh apresentado por outro aparelho é tratado como roubo                                                           |
| Reuso de refresh                | Revoga a família + a sessão + o `sid` no Redis                                                                                                                                                           | Derruba também os access tokens já emitidos para a sessão                                                                      |
| Corrida na rotação              | `UPDATE … WHERE usadoEm IS NULL` em transação                                                                                                                                                            | Duas renovações simultâneas com o mesmo token: só uma vence, a outra conta como reuso                                          |
| Enumeração de contas            | Login com e-mail inexistente executa um Argon2 fictício; recuperação sempre responde 202                                                                                                                 | Mesmo tempo e mesma resposta para conta existente ou não                                                                       |
| Conta desativada                | Só é informada depois de a senha estar correta                                                                                                                                                           | Não revela o estado da conta a quem não sabe a senha                                                                           |
| Rate limit                      | Limitador próprio em Redis para login (5/15 min, bloqueio progressivo ×2), recuperação (3/h por e-mail) e verificação de código (10/15 min por IP); `@fastify/rate-limit` para o limite global (100/min) | O plugin não faz bloqueio progressivo                                                                                          |
| Privacidade no Redis            | IP e e-mail entram nas chaves como **hash**                                                                                                                                                              | IP é dado pessoal (LGPD). O teste de integração encontrou o plugin gravando o IP em claro; corrigido                           |
| Rehash                          | Hash com parâmetros antigos é refeito no próximo login                                                                                                                                                   | Permite subir os custos do Argon2 no futuro                                                                                    |
| `@abraco/shared`                | Ganhou build para `dist`; o app lê o código-fonte pela condição `react-native`                                                                                                                           | A API em produção roda JavaScript compilado                                                                                    |
| Erros                           | RFC 9457 (`application/problem+json`) com `codigo` estável; Zod → 400, regra de domínio → 422                                                                                                            | O app decide a mensagem pelo `codigo`                                                                                          |
| E-mail                          | BullMQ + Nodemailer; job removido ao concluir                                                                                                                                                            | O código de recuperação não fica guardado no Redis                                                                             |

## Bug encontrado pelos testes de integração

Com a opção `noTimestamp: true`, o `fast-jwt` **remove o `iat` do payload** mesmo quando ele vem
explícito, e o verificador (que exige `iat`) recusava todos os tokens. Os testes negativos
("token X → 401") passavam por acaso. Corrigido, e agora todo teste negativo tem um positivo
ao lado; há também testes unitários do JWT com chaves reais, que pegariam o problema sem Docker.

## Checklist (seções 6 e 9)

| Item                                                                          | Situação                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Access token EdDSA (Ed25519), 15 min, claims sub/iat/exp/iss/aud/jti/sid/role | ✅                                                             |
| Refresh 256 bits, SHA-256, 30 dias, vinculado a sid e deviceId                | ✅                                                             |
| Rotação a cada uso; reuso → revoga a família                                  | ✅ testado                                                     |
| Revogação de jti/sid no Redis com TTL = validade restante                     | ✅                                                             |
| Valida alg, iss, aud, exp; rejeita alg none                                   | ✅ testado (também confusão HS256 e payload adulterado)        |
| Argon2id m=65536, t=3, p=4                                                    | ✅ testado                                                     |
| CPF e data de nascimento com AES-256-GCM                                      | ✅ testado (inclui detecção de adulteração e rotação de chave) |
| Zod estrito em toda borda                                                     | ✅ testado (campo extra → 400)                                 |
| Rate limit: login 5/15 min progressivo, recuperação 3/h, API 100/min          | ✅ testado                                                     |
| helmet, HSTS 1 ano, CORS restrito                                             | ✅ testado                                                     |
| Logs sem CPF, senha, token ou e-mail                                          | ✅ verificado nos logs reais do container                      |
| LGPD: `aceitouTermosEm` e `consentimentoDadosEm`                              | ✅                                                             |
| Teste: token expirado → 401                                                   | ✅                                                             |
| Teste: token reutilizado após rotação → 401 + revoga família                  | ✅                                                             |
| Teste: alg none → 401                                                         | ✅                                                             |
| Teste: usuário comum em `/admin/*` → 403                                      | ✅ (guard `exigirRole`, usado pelo painel na Etapa 9)          |
| Teste: IDOR adoção                                                            | ⏳ Etapa 5 (módulo de adoções)                                 |
| Teste: upload com magic bytes falsos → 422                                    | ⏳ Etapa 4 (upload de fotos)                                   |

## Números

- 86 testes unitários; cobertura de domínio + casos de uso: **97,9% linhas / 95,4% ramos** (meta 85%)
- 23 testes de integração com Postgres 16 e Redis 7 reais (Testcontainers)
- Verificado no docker-compose: cadastro → `/me` → recuperação → e-mail no Mailpit
