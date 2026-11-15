# Etapa 6 — Doações de animais

## Arquitetura

```
modules/doacoes-animais/domain/          validação, transições de status, IDOR, linha do tempo
modules/doacoes-animais/application/     doar, minhas, obter, admin (listar, obter, aprovar, recusar, receber)
modules/doacoes-animais/infrastructure/  repositório Prisma (receber = transação que cria o Animal)
modules/doacoes-animais/http/            multipart (dados + fotos), rotas do doador e /admin

shared/aplicacao/armazenamento.ts        + copiar() no bucket, removerSemFalhar()
shared/aplicacao/emails-doacao-animal.ts porta dos 4 e-mails
```

Reaproveita da Etapa 4 as fotos (magic bytes, sharp, S3, compensação) e, da Etapa 5, as
notificações, a auditoria na transação, o `Ator` e o rate limit.

## Status

```
PENDENTE ──aprovar──▶ APROVADA ──receber──▶ RECEBIDA  (cria o Animal EM_TRATAMENTO)
   │                     │
   └──────recusar────────┴──▶ RECUSADA
```

## Rotas

| Rota                                          | Acesso        | Observação                                                        |
| --------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| `POST /v1/doacoes-animais`                    | logado        | multipart: `dados` (JSON) + `fotos` (1 a 10). 10/hora por usuário |
| `GET /v1/me/doacoes-animais`                  | logado        | Só as do usuário (filtro vem do token)                            |
| `GET /v1/doacoes-animais/{id}`                | dono ou ADMIN | Outro usuário → 403                                               |
| `GET /v1/admin/doacoes-animais`               | ADMIN         | Filtros: status, período                                          |
| `GET /v1/admin/doacoes-animais/{id}`          | ADMIN         | **Nova** (faltava no contrato): contato do doador para a retirada |
| `POST /v1/admin/doacoes-animais/{id}/aprovar` | ADMIN         | PENDENTE → APROVADA                                               |
| `POST /v1/admin/doacoes-animais/{id}/recusar` | ADMIN         | PENDENTE ou APROVADA → RECUSADA, com motivo                       |
| `POST /v1/admin/doacoes-animais/{id}/receber` | ADMIN         | APROVADA → RECEBIDA + Animal; idempotente                         |

## Receber a doação

1. Copia cada foto da doação para `animais/{novoAnimal}/…` (cópia dentro do bucket, sem baixar).
2. Numa transação:
   - a doação passa de `APROVADA` para `RECEBIDA` (a mudança condicional trava a linha);
   - o Animal é criado EM_TRATAMENTO, com as fotos copiadas;
   - `animalCriadoId` é preenchido (é UNIQUE);
   - o doador recebe a notificação;
   - o AuditLog registra `DOACAO_ANIMAL_RECEBIDA` e `ANIMAL_CRIADO` (origem: DOACAO).
3. Se algo falhar, as cópias são apagadas do bucket.

| Situação                                       | Resultado                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toque duplo ou nova chamada depois de recebida | 200 com o mesmo `animalCriadoId`; nenhum animal novo                                                                                                                                  |
| Duas admins recebem **ao mesmo tempo**         | A segunda espera a trava, encontra RECEBIDA, apaga as próprias cópias e devolve o resultado da primeira (200). Testado com requisições simultâneas reais: 1 animal, 2 fotos no bucket |
| Receber sem aprovar                            | 409                                                                                                                                                                                   |
| Falha ao copiar uma foto                       | Nada é criado; as cópias já feitas são apagadas                                                                                                                                       |

## Decisões

| Tema                          | Decisão                                                                                     | Motivo                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Fotos do animal criado        | **Cópias** das fotos da doação                                                              | Apagar uma foto do animal depois não apaga a da doação (testado)               |
| História pública              | Texto padrão ("Chegou à Abraço Animal por doação…"); o `motivoDoacao` **não** é copiado     | O motivo foi escrito pelo doador para a equipe e pode ter dados pessoais       |
| Validação dos dados do animal | As mesmas regras do cadastro de animais                                                     | O Animal criado ao receber é sempre válido                                     |
| Fotos obrigatórias            | 1 a 10                                                                                      | Sem foto o admin não consegue avaliar                                          |
| Recusa depois de aprovada     | Permitida                                                                                   | A retirada pode não dar certo                                                  |
| Campo `dados` do multipart    | JSON validado com Zod estrito; malformado ou com campo extra → **400**, como nas rotas JSON | Novo tipo de erro `REQUISICAO_INVALIDA` para manter o mesmo padrão de resposta |
| Rate limit                    | Aplicado **antes** de ler o corpo                                                           | Quem estourou o limite nem chega a enviar as fotos (até 50 MB)                 |
| `recebidoEm`                  | Coluna nova (migração `doacao_animal_recebido_em`)                                          | Etapa final da linha do tempo; `analisadoEm` continua sendo a data da análise  |
| Notificações                  | Tipo `DOACAO_ANIMAL_ATUALIZADA`; sem o motivo da recusa                                     | Podem aparecer na tela bloqueada (push, Etapa 10)                              |
| Endereço de retirada          | Visível só ao doador e ao ADMIN                                                             | Dado pessoal                                                                   |

## Ponto em aberto (Etapa 10)

A seção 4 da spec traz o card "Minhas doações de animais" no Perfil, mas **não descreve a tela do
formulário "Doar um animal"**. Pelas regras de trabalho, vou perguntar antes de criá-la.

## Testes

| Tipo                                            | Quantidade    |
| ----------------------------------------------- | ------------- |
| Unitários da API (todos os módulos)             | 222           |
| Integração (auth + animais + adoções + doações) | 73 (11 novos) |

Cobertura de domínio + casos de uso: **98,8% linhas / 92,7% ramos** (meta 85%).

Fumaça no docker-compose: doar com foto, aprovar, receber, receber de novo (mesmo animal),
animal EM_TRATAMENTO com foto acessível, sino com 2 notificações e os 3 e-mails entregues no
Mailpit. Os logs não têm e-mail, senha, token nem endereço.
