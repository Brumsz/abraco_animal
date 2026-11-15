# Etapa 8a — Apadrinhamentos, voluntariado e institucional

A Etapa 8 foi dividida em dois PRs. Este é o 8a; o 8b traz feed, notícias e chat.

## Rotas

### Apadrinhamentos

| Rota                              | Acesso                   | Observação                                                               |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `POST /v1/apadrinhamentos`        | logado                   | Só animal DISPONIVEL (D6) → senão 422 `ANIMAL_NAO_APADRINHAVEL`. 20/hora |
| `GET /v1/me/apadrinhamentos`      | logado                   | Ativos, mais recentes primeiro                                           |
| `DELETE /v1/apadrinhamentos/{id}` | o próprio padrinho       | Outro usuário → 403. Idempotente                                         |
| `GET /v1/animais/{id}/padrinhos`  | público (token opcional) | **Só o primeiro nome** + mensagem; mesma visibilidade do animal          |

### Voluntariado

| Rota                                      | Acesso | Observação                                                        |
| ----------------------------------------- | ------ | ----------------------------------------------------------------- |
| `POST /v1/voluntariado/candidaturas`      | logado | Formulário da seção 4. Recusada pode ser reenviada. 5/hora        |
| `GET /v1/me/voluntariado`                 | logado | 404 se não houver                                                 |
| `GET /v1/admin/voluntarios` (+ `/{id}`)   | ADMIN  | Filtro por status; detalhe com contato (sem CPF)                  |
| `POST /v1/admin/voluntarios/{id}/aprovar` | ADMIN  | `cargo` opcional. Promove USUARIO → VOLUNTARIO na mesma transação |
| `POST /v1/admin/voluntarios/{id}/recusar` | ADMIN  | `motivoRecusa` obrigatório                                        |

### Institucional

| Rota                               | Acesso  | Observação                                                                                          |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `GET /v1/institucional/perfil`     | público | Seções publicadas, na ordem Sobre nós → Fundação → Fundadores. `Cache-Control: public, max-age=300` |
| `GET /v1/institucional/faq`        | público | Perguntas publicadas, em ordem. Mesmo cache                                                         |
| `GET /v1/admin/perfil-ong`         | ADMIN   | Todas, inclusive rascunhos                                                                          |
| `PUT /v1/admin/perfil-ong/{secao}` | ADMIN   | Cria ou edita a seção                                                                               |
| `GET/POST /v1/admin/faq`           | ADMIN   | Lista todas / cria no fim da lista                                                                  |
| `PUT/DELETE /v1/admin/faq/{id}`    | ADMIN   | Edita / remove                                                                                      |
| `PUT /v1/admin/faq/ordem`          | ADMIN   | Reordena (arrastar e soltar): recebe **todos** os ids                                               |

## Decisões

| Tema                      | Decisão                                                                                      | Motivo                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Texto institucional       | Migração `texto_institucional_oficial` grava o texto da spec **sem alterações** em SOBRE_NOS | A spec pede para preservar o texto. `ON CONFLICT DO NOTHING`: nunca sobrescreve uma edição       |
| Fundação, Fundadores, FAQ | Começam vazios                                                                               | Não inventar fatos sobre a ONG; a equipe preenche no painel                                      |
| Padrinhos públicos        | Só o primeiro nome (e a foto de perfil, quando existir); contas removidas não aparecem       | Minimização (LGPD)                                                                               |
| Mensagem do padrinho      | Texto simples, até 500 caracteres, exibido como texto no app                                 | Sem HTML = sem script. **Sem moderação ainda**: botão de remover pode entrar no painel (Etapa 9) |
| Reapadrinhar              | Encerrado → apadrinhar de novo **reativa** o mesmo registro                                  | UNIQUE(usuário, animal) no schema                                                                |
| Promoção a voluntário     | Na transação da aprovação; só promove quem é USUARIO (um ADMIN nunca é rebaixado)            | O token atual mantém a role antiga até a renovação (≤ 15 min), que já lê a role do banco         |
| Candidatura repetida      | PENDENTE/APROVADA → 409; RECUSADA → reabre o mesmo registro                                  | UNIQUE(usuarioId) no schema                                                                      |
| Conteúdo institucional    | Texto simples (sem HTML)                                                                     | Texto rico só nas notícias (8b), com sanitização                                                 |
| Auditoria                 | Aprovar/recusar voluntário, editar seção, criar/editar/remover/reordenar FAQ                 | "Toda ação sensível gera AuditLog" (seção 5). Motivo de recusa fica fora (texto livre)           |

## Testes

| Tipo                                | Quantidade     |
| ----------------------------------- | -------------- |
| Unitários da API (todos os módulos) | 314            |
| Integração (todos os módulos)       | 102 (11 novos) |

Cobertura de domínio + casos de uso: **98,3% linhas / 91,5% ramos** (meta 85%).

Destaques da integração: apadrinhar 3× em paralelo → 1 criado e 2 × 409; a lista pública não
contém sobrenome nem e-mail. A aprovação promove a VOLUNTARIO e, depois do novo login, o
voluntário vê os animais EM_TRATAMENTO. O "Sobre nós" vem com o texto oficial da migração.
