# Etapa 4 — Módulo de animais

## Arquitetura do módulo

```
modules/animais/domain/          regras de status, validação dos dados, visibilidade por role
modules/animais/application/     casos de uso: listar, obter, criar, editar, status, remover, fotos
modules/animais/infrastructure/  repositório Prisma (com auditoria na mesma transação)
modules/animais/http/            rotas públicas e /admin, esquemas Zod, multipart

shared/dominio/formato-imagem.ts      magic bytes (JPEG, PNG, WebP)
shared/aplicacao/imagens.ts           porta do processador + "confere todos antes de processar"
shared/aplicacao/armazenamento.ts     porta do S3
shared/aplicacao/auditoria.ts         entrada de AuditLog
shared/infra/processador-imagens-sharp.ts
shared/infra/armazenamento-s3.ts
shared/http/cursor.ts                 cursor opaco de paginação
```

As peças de imagem, S3, auditoria e cursor ficam em `shared/` porque as doações de animais
(Etapa 6) e os posts (Etapa 8) vão reutilizá-las.

## Rotas

| Rota                                         | Acesso                   | Observação                                                        |
| -------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `GET /v1/animais`                            | público (token opcional) | Público vê só DISPONIVEL; ADMIN e VOLUNTARIO veem todos e filtram |
| `GET /v1/animais/{id}`                       | público (token opcional) | INDISPONIVEL → 404 para quem não é da equipe                      |
| `POST /v1/admin/animais`                     | ADMIN                    | Status inicial padrão DISPONIVEL; ADOTADO recusado                |
| `PUT /v1/admin/animais/{id}`                 | ADMIN                    | Não aceita `status` (400)                                         |
| `PATCH /v1/admin/animais/{id}/status`        | ADMIN                    | Regras de transição abaixo                                        |
| `DELETE /v1/admin/animais/{id}`              | ADMIN                    | Soft delete (`removidoEm`); fotos e histórico preservados         |
| `POST /v1/admin/animais/{id}/fotos`          | ADMIN                    | multipart, campo `fotos`                                          |
| `PUT /v1/admin/animais/{id}/fotos`           | ADMIN                    | Reordena: recebe **todos** os ids na nova ordem                   |
| `DELETE /v1/admin/animais/{id}/fotos/{foto}` | ADMIN                    | Remove do banco e depois do bucket                                |

`GET /animais/{id}/padrinhos` fica para a Etapa 8 (apadrinhamentos); o detalhe já traz
`totalPadrinhos`.

## Decisões

| Tema                   | Decisão                                                                                                           | Motivo                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Status ADOTADO         | Nunca manual: só pela aprovação de uma adoção (Etapa 5). Sair de ADOTADO é permitido (devolução)                  | Evita animal "adotado" sem adotante registrado                                                           |
| Mesmo status           | PATCH com o status atual é idempotente (sem escrita, sem auditoria)                                               | Toque duplo no app não polui o AuditLog                                                                  |
| Concorrência           | `UPDATE … WHERE status = <lido>`; se outra pessoa mudou antes → 409 `ANIMAL_ALTERADO`                             | Dois admins alterando ao mesmo tempo não sobrescrevem um ao outro                                        |
| INDISPONIVEL           | Invisível ao público também no detalhe (404, sem confirmar que existe)                                            | Pode indicar animal em situação delicada                                                                 |
| Auditoria              | Toda escrita do admin grava `AuditLog` **na mesma transação**; edição registra só os **nomes** dos campos         | Ou as duas coisas acontecem, ou nenhuma. Antecipado da Etapa 9                                           |
| Paginação              | Keyset por `(criadoEm DESC, publicId DESC)`; cursor = base64url de `[data, uuid]`                                 | Estável com inserções; o desempate por `publicId` não revela a sequência do `id` interno                 |
| Índices                | `(status, criadoEm DESC, publicId DESC)` e `(criadoEm DESC, publicId DESC)` — migração `animais_paginacao_cursor` | A listagem pública sempre filtra status                                                                  |
| Busca por nome         | `ILIKE` com `%`, `_` e `\` escapados                                                                              | **Bug encontrado pelo teste de integração**: o Prisma não escapa curingas, e `?q=%` listava tudo         |
| Token em rota pública  | Sem `Authorization` = anônimo; token inválido = 401                                                               | Rebaixar para anônimo em silêncio esconderia um app com sessão quebrada                                  |
| Validação do arquivo   | Magic bytes de **todos** os arquivos antes de processar qualquer um                                               | Um arquivo falso recusa o envio inteiro, sem gastar CPU nem S3                                           |
| Formatos aceitos       | JPEG, PNG, WebP. SVG, GIF, PDF e executáveis → 422                                                                | SVG pode carregar script; os demais não são fotos                                                        |
| Processamento          | sharp: aplica a orientação, reduz a ≤ 1600 px, reencoda em WebP q80 **sem metadados**                             | EXIF pode ter o GPS de onde a foto foi tirada (ex.: a casa de quem resgatou). WebP é ~30% menor que JPEG |
| Bomba de descompressão | `limitInputPixels` = 40 MP e `failOn: 'error'`                                                                    | Um PNG de poucos KB pode ocupar GB de memória ao abrir                                                   |
| Limites                | 5 MB por arquivo, 10 por envio (413), **10 fotos por animal no total** (422)                                      | Seção 6 + a galeria não cresce sem limite                                                                |
| Chave no bucket        | `animais/{animalId}/{uuid}.webp`                                                                                  | Não revela o nome original do arquivo; não dá para adivinhar outras                                      |
| Compensação            | Falha no banco depois do upload → apaga do bucket o que subiu                                                     | Nada fica órfão quando o envio falha                                                                     |
| Remoção de foto        | Banco primeiro, bucket depois (falha no bucket não desfaz a remoção)                                              | O pior caso é um objeto órfão, invisível (bucket privado). Limpeza periódica: Etapa 11                   |
| URL assinada           | 1h de validade, assinada no início da janela de 30 min                                                            | Mesma URL durante a janela → o app reaproveita o cache de imagem. Cada URL vale de 30 a 60 min           |
| Endpoint público do S3 | Nova variável `S3_ENDPOINT_PUBLICO`                                                                               | Dentro do Docker a API fala com `s3:8333`, que o celular não alcança; a assinatura inclui o host         |
| Multipart              | `@fastify/multipart` registrado só no escopo `/admin`                                                             | Rotas públicas não aceitam upload                                                                        |

## Dependências novas

| Pacote                                                          | Por quê                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@fastify/multipart` 10.1.8                                     | Previsto na spec. Plugin oficial; limites de tamanho e quantidade cortam o envio cedo   |
| `sharp` 0.35.5                                                  | Previsto na spec. Binário pronto para Windows e Linux (verificado na imagem distroless) |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 3.1167.0 | SDK oficial; funciona com SeaweedFS (dev), AWS S3 e Cloudflare R2                       |

A detecção de magic bytes é código próprio (20 linhas para 3 formatos) em vez do pacote
`file-type`, que reconhece centenas de formatos que não usamos.

## Testes

| Tipo                               | Quantidade | Destaques                                                                                               |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Unitários (domínio + casos de uso) | 57         | Invariantes de status, visibilidade, paginação, limite de fotos, compensação no S3                      |
| Unitários (infra sem Docker)       | 16         | sharp real (remove EXIF/GPS, orientação, 1600 px, JPEG truncado, bomba de pixels), URL assinada, cursor |
| Integração                         | 22         | Postgres + Redis + **SeaweedFS reais**                                                                  |

Cobertura de domínio + casos de uso da API inteira: **98,7% linhas / 96,8% ramos** (meta 85%).

Checklist de segurança da seção 9 que esta etapa fecha:

| Item                                                            | Situação                                 |
| --------------------------------------------------------------- | ---------------------------------------- |
| Upload com extensão .jpg mas magic bytes de .exe → 422          | ✅ testado (unitário e integração)       |
| Upload de imagem: magic bytes inválidos rejeitados (integração) | ✅                                       |
| Usuário comum em `/admin/*` → 403                               | ✅ testado em todas as rotas de animais  |
| Animal: invariantes de status (unitário)                        | ✅                                       |
| EXIF removido                                                   | ✅ conferido no objeto gravado no bucket |
| Bucket nunca exposto; URL assinada de 1h                        | ✅ sem assinatura → 403                  |

Também verificado na stack do docker-compose: admin cria o animal, envia a foto, o público lista
e baixa pela URL assinada, e o `.exe` disfarçado recebe 422. Os logs não têm e-mail, senha
nem token.
