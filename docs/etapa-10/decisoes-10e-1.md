# Etapa 10e-1 — API de "minha conta" (perfil, senha e LGPD)

As rotas de conta estavam no contrato da Etapa 1, mas só `GET /me` tinha sido implementada.
As telas Perfil, Editar perfil e Configurações (10e-2) dependem delas.

## Rotas novas (módulo `conta`)

| Rota                    | O que faz                                                                    |
| ----------------------- | ---------------------------------------------------------------------------- |
| `GET /v1/me/resumo`     | Números do Perfil: adoções aprovadas, doações (Pix + animais) e apadrinhados |
| `PATCH /v1/me`          | Nome, telefone e endereço                                                    |
| `POST /v1/me/senha`     | Troca a senha conferindo a atual                                             |
| `GET /v1/me/exportacao` | Cópia de tudo o que a ONG guarda sobre a pessoa (LGPD art. 18, II e V)       |
| `DELETE /v1/me`         | Exclui a conta por anonimização (LGPD art. 18, VI)                           |

Todas agem só sobre o usuário do token: não há id na URL, então não existe IDOR.

## Decisões

| Tema                          | Decisão                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| E-mail e CPF                  | Não mudam por `PATCH /me` (e-mail exigiria confirmação; CPF é documento). Mandar → 400   |
| Trocar a senha                | Confere a atual, aplica a política, **mantém esta sessão** e derruba as outras + e-mail  |
| Excluir conta                 | Pede a senha (ação irreversível); o **único admin** não pode se excluir (`ULTIMO_ADMIN`) |
| Chutar a senha atual          | Limite por usuário: 5 em 15 min, progressivo (vale para trocar senha e excluir conta)    |
| Exportação                    | Limite de 5 por hora; `Cache-Control: no-store`                                          |
| CPF na resposta da exportação | Exceção **explícita e única** no teste que proíbe CPF/nascimento em respostas do OpenAPI |

### O que a exclusão faz (numa transação)

- **Usuário:** nome "Conta removida", e-mail `removido+<uuid>@anon.invalid`, telefone, endereço,
  CPF e nascimento apagados (cifrados vazios), senha aleatória descartada, inativo e `removidoEm`.
  E-mail e CPF ficam **livres para um novo cadastro**.
- **Histórico da ONG fica, sem vínculo:** adoções, doações de animais e Pix perdem o `usuarioId`;
  textos pessoais (motivo, outros animais, endereço de retirada) viram "[removido a pedido do titular]".
- **Pedidos em andamento** perdem o sentido: adoções pendentes saem da fila; doações de animal
  pendentes/aprovadas viram recusadas ("Conta do doador excluída").
- **Apagados:** conversas (e mensagens), curtidas, notificações, apadrinhamentos, candidatura de
  voluntário, aparelhos de push e códigos de recuperação.
- **Sessões:** todas revogadas no banco e no Redis.

## Também nesta parte

- `problemaNome` em `@abraco/shared`: nome com 3+ letras e sem "@" (app e API) — o preenchimento
  automático do celular tinha posto o e-mail no campo nome.

## Números

Integração: 10 testes novos (Postgres, Redis e S3 reais). Pipeline 16/16.
