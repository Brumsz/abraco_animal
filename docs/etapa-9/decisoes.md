# Etapa 9 — Painel administrativo

As gestões de adoções, doações, animais, voluntários, conteúdo e chat foram entregues nas
Etapas 4 a 8. Esta etapa traz o que é **só do painel**: dashboard, gestão de usuários e consulta
ao log de auditoria. Com ela, o backend de todas as telas administrativas da seção 4 está pronto.

## Rotas (todas só ADMIN; cada caso de uso confere a role de novo)

| Rota                                  | O que faz                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/admin/dashboard`             | Cards (adoções e doações de animais pendentes, animais disponíveis, Pix do mês), gráfico de adoções aprovadas nos últimos 6 meses, 5 pendências mais recentes |
| `GET /v1/admin/usuarios`              | Filtro por role, busca por nome/e-mail (`%` e `_` literais), paginação                                                                                        |
| `PATCH /v1/admin/usuarios/{id}/ativo` | Ativar/desativar. **Desativar derruba as sessões e os access tokens na hora**                                                                                 |
| `PATCH /v1/admin/usuarios/{id}/role`  | USUARIO ↔ VOLUNTARIO. Rebaixar também derruba as sessões                                                                                                      |
| `GET /v1/admin/auditoria`             | Filtros por admin, entidade, ação e período; paginação                                                                                                        |

Também: `GET /v1/admin/voluntarios` passou a trazer o **endereço completo** do voluntário
(seção 4: "lista de voluntários ativos com cargo e endereço").

## Decisões

| Tema                              | Decisão                                                                                                                  | Motivo                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Desativar/rebaixar                | Revoga as sessões no banco **e** os `sid` no Redis (mesmo mecanismo da redefinição de senha)                             | Sem isso, o token atual valeria por até 15 min. Testado: `/me` → 401 logo depois                           |
| Contas ADMIN                      | Não podem ser desativadas nem ter a role alterada pelo app; o admin não altera a própria conta                           | Um admin não tranca outro (nem a si mesmo) para fora. Garantido também no `UPDATE … WHERE role <> 'ADMIN'` |
| Promoção a ADMIN                  | Não existe no app (o esquema só aceita USUARIO/VOLUNTARIO → `ADMIN` dá 400)                                              | Decisão da Etapa 1 (#14)                                                                                   |
| Mês e gráfico                     | Fuso de **São Paulo** (UTC−3 fixo, sem horário de verão desde 2019); a SQL agrupa com `AT TIME ZONE 'America/Sao_Paulo'` | Uma doação às 23h do dia 30 conta no mês certo. Testado na virada de mês e de ano                          |
| "Adoções por mês"                 | Adoções **aprovadas** (pela data da aprovação); meses sem adoção aparecem com 0                                          | O gráfico sempre tem 6 barras                                                                              |
| "Doações financeiras do mês"      | Pix **confirmados** com pagamento no mês; total somado no banco e convertido sem ponto flutuante                         | —                                                                                                          |
| Pendências                        | Adoções, doações de animais e candidaturas pendentes, intercaladas por data. Títulos sem dados pessoais                  | O painel pode ficar aberto numa tela compartilhada                                                         |
| CPF na lista de usuários          | **Não aparece** (o contrato da Etapa 1 previa CPF mascarado)                                                             | Minimização (LGPD); mesma decisão das Etapas 5 e 8a                                                        |
| Ler a auditoria                   | Não gera registro de auditoria                                                                                           | Evita registros a cada leitura; a auditoria cobre ações que **alteram** dados                              |
| Moderação da mensagem do padrinho | Fica para depois (não está na seção 4)                                                                                   | Apontado na Etapa 8a                                                                                       |

## Testes

| Tipo                                | Quantidade    |
| ----------------------------------- | ------------- |
| Unitários da API (todos os módulos) | 373           |
| Integração (todos os módulos)       | 133 (7 novos) |

Cobertura de domínio + casos de uso: **97,6% linhas / 89,1% ramos** (meta 85%).

A integração monta um cenário real (adoção aprovada e pendente, Pix confirmado pelo PSP
simulado, candidatura) e confere cada número do dashboard. Também prova que um voluntário
rebaixado perde o acesso **na hora**, mesmo com a conta ativa.
