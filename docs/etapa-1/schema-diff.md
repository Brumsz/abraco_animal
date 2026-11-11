# Etapa 1 — Diff do schema

> **Base do diff:** o `prisma/schema.prisma` original não estava no repositório. O diff é relativo a
> `prisma/schema.original.reconstruido.prisma`, inferido a partir da seção 3 da spec.
> Diff unificado completo: [`schema.diff`](./schema.diff) (gerado novamente após a revisão).

Legenda: **+** adicionado · **−** removido · **~** alterado · **🟢 EXTRA** = fora da seção 3, aprovado na revisão da Etapa 1.

## Global
> Prisma **7.10.1**: `url` saiu do `datasource` (vai para `prisma.config.ts`) e o generator passou a ser `prisma-client`.

| Item | Antes | Depois | Motivo |
|---|---|---|---|
| ~ IDs | `id Int` exposto | `id Int` interno + `publicId String @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid` | IDs da API em UUID gerados pelo banco; FKs continuam Int |
| ~ Datas | `DateTime` (timestamp) | `DateTime @db.Timestamptz(3)` | Tudo em UTC |
| ~ Tabelas | nome do modelo | `@@map` snake_case plural (`usuarios`, `adocoes`…) | Convenção SQL |
| + Índices | — | índices para filtros, listagens e cursor | Desempenho |

## Enums
| Enum | Mudança |
|---|---|
| ~ `Role` | `GERAL → USUARIO`, `PROPRIETARIA → ADMIN` (`VOLUNTARIO` mantido) |
| ~ `TipoAnimal` | + `OUTRO` |
| + `Sexo`, `Porte`, `StatusAnimal`, `TipoMoradia`, `StatusDoacaoAnimal`, `StatusDoacaoFinanceira`, `StatusConversa` | novos (seção 3) |
| + 🟢 `StatusVoluntario`, `AreaInteresse`, `DiaSemana`, `Turno` | formulário de voluntariado (seção 4) |
| + 🟢 `TipoNotificacao` | tipos fechados de notificação (o app monta a rota) |

## Usuario
| Campo | Antes | Depois | Motivo |
|---|---|---|---|
| ~ `senha` | `String` | `senhaHash String` | Argon2id; nunca retornado |
| − `cpf` | `String @unique` | — | substituído por campos cifrados |
| + `cpfCifrado`, `cpfIv`, `cpfTag` | — | `Bytes` | AES-256-GCM em repouso |
| + `cpfHash` | — | `String @unique` | blind index HMAC p/ unicidade (ver decisões §4) |
| − `dataNasc` | `DateTime` | — | substituído por campos cifrados |
| + `dataNascCifrada`, `dataNascIv`, `dataNascTag` | — | `Bytes` | AES-256-GCM |
| ~ `endereco` | `String` | `cep, logradouro, numero, complemento?, bairro, cidade, uf` | auto-preenchimento ViaCEP |
| + `fotoUrl?`, `capaUrl?` | — | `String?` | header do Perfil |
| ~ `role` | `@default(GERAL)` | `@default(USUARIO)` | novo enum |
| + `aceitouTermosEm`, `consentimentoDadosEm` | — | `DateTime` | LGPD |
| + `ativo` | — | `Boolean @default(true)` | ativar/desativar conta |
| + `atualizadoEm`, `removidoEm?` | — | `DateTime` | auditoria / soft delete |

## Animal
| Campo | Antes | Depois |
|---|---|---|
| − `foto` | `String` | → modelo `AnimalFoto` |
| − `disponivel` | `Boolean` | → `status StatusAnimal @default(DISPONIVEL)` |
| + `idadeAprox` | — | `Int` (meses) |
| + `sexo`, `porte` | — | enums |
| + `descricao`, `historiaResgate` | — | `@db.Text` |
| + `vacinado`, `castrado` | — | `Boolean @default(false)` |
| + `atualizadoEm`, `removidoEm?` | — | soft delete |
| + **AnimalFoto** (novo) | — | `id, publicId, animalId, url, ordem, criadoEm`, `@@unique([animalId, ordem])` |

## Adocao
| Campo | Depois |
|---|---|
| ~ `usuarioId` | `Int?` com `onDelete: SetNull` — permite anonimização LGPD mantendo a adoção |
| + triagem | `motivo Text`, `tipoMoradia TipoMoradia`, `possuiEspacoAdequado Boolean`, `outrosAnimais Text?`, `termoAceitoEm DateTime` |
| + análise | `analisadoPorId Int?` (relação `AdocaoAnalisadaPor`), `analisadoEm?`, `motivoRecusa Text?` |
| + 🟢 `recusaAutomatica` | `Boolean @default(false)` — recusada porque o animal foi adotado por outra pessoa |
| + `atualizadoEm`, `removidoEm?` | soft delete |
| + índice único parcial | `(usuarioId, animalId) WHERE status='PENDENTE' AND removidoEm IS NULL` → `prisma/migrations/_manual/adocao_pendente_unica.sql` |

## Novos modelos da seção 3
| Modelo | Campos | Observações |
|---|---|---|
| **DoacaoAnimal** | conforme spec | + `animalCriadoId Int? @unique` → vínculo 1:1 com o Animal criado ao marcar RECEBIDA (impede duplicar) |
| **DoacaoAnimalFoto** | `id, doacaoId, url, ordem, criadoEm` | `@@unique([doacaoId, ordem])` |
| **DoacaoFinanceira** | conforme spec | + `idempotencyKey @unique`, + 🟢 `anonima Boolean`, + `atualizadoEm`; ~ `pixQrCodeUrl` **opcional** (QR gerado no app) |
| **Curtida** | `id, postId, usuarioId, criadoEm` | `@@unique([postId, usuarioId])` |
| **PostImagem** | `id, postId, url, ordem, criadoEm` | carrossel |
| **AuditLog** | `id, adminId, acao, entidade, entidadeId, detalhe Json?, criadoEm` | `entidadeId` = publicId |

## Modelos alterados
| Modelo | Mudanças |
|---|---|
| **Apadrinhamento** | + `ativo`, + `mensagemPadrinho Text?`, + `atualizadoEm`, + `@@unique([usuarioId, animalId])` |
| **Conversa** | + `adminId Int?` (relação `ConversaAdmin`), + `status StatusConversa`, + `assunto?`, + `atualizadoEm` |
| **Mensagem** | + `lida Boolean @default(false)`, + `lidaEm?` |
| **Post** | − `curtidas Int`, − `imagem` (→ `PostImagem`), + `publicado @default(false)`, + `atualizadoEm` |
| **Noticia** | + `slug @unique`, + `publicado @default(false)`, + `atualizadoEm` |
| **PerfilOng**, **Faq** | + `publicado @default(true)`, + `atualizadoEm` |
| **RecuperacaoSenha** | ~ `codigo → codigoHash` (SHA-256), + `tentativas @default(0)`, ~ `usado Boolean → usadoEm DateTime?` |
| **Voluntario** 🟢 | + `status`, `areasInteresse[]`, `areaInteresseOutros?`, `disponibilidadeDias[]`, `turnos[]`, `motivacao`, `habilidades?`, análise (`analisadoPorId?`, `analisadoEm?`, `motivoRecusa?`) |

## 🟢 Modelos extras aprovados (não estão na seção 3)
| Modelo | Por quê |
|---|---|
| **Sessao** (`sid`, `deviceId`, `revogadaEm`) | seção 6: refresh vinculado a `sid` e `deviceId` |
| **RefreshToken** (`tokenHash`, `familiaId`, `substituidoPorId`, `usadoEm`, `revogadoEm`) | rotação + detecção de reuso → revogação da família |
| **WebhookEvento** (`provedor`, `eventoId` único) | processar cada webhook do Asaas uma única vez |
| **Notificacao** (`tipo TipoNotificacao`, `entidadeId`, `lidaEm`) | sino da Home + push no 1º lançamento |
| **DispositivoPush** | push notifications (BullMQ) precisam do token Expo |

## Checklist da seção 3
- [x] Usuario: role, senha Argon2id, CPF/dataNasc AES-GCM + IV, aceitouTermosEm, consentimentoDadosEm, ativo, removidoEm
- [x] Animal: idadeAprox, sexo, porte, descricao, historiaResgate, vacinado, castrado, OUTRO, status, AnimalFoto
- [x] Adocao: triagem, análise, índice único parcial, removidoEm
- [x] DoacaoAnimal + DoacaoAnimalFoto
- [x] DoacaoFinanceira
- [x] Apadrinhamento: ativo, mensagemPadrinho
- [x] Conversa: adminId, status, assunto
- [x] Mensagem: lida, lidaEm
- [x] Post: remove curtidas, Curtida, PostImagem, publicado, atualizadoEm
- [x] Noticia: publicado, atualizadoEm, slug
- [x] PerfilOng e FAQ: publicado, atualizadoEm
- [x] RecuperacaoSenha: codigoHash, tentativas
- [x] AuditLog
- [x] IDs em UUID na API (publicId), Int interno, soft delete, UTC
