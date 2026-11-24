# Etapa 10f-1 — Telas da equipe: Central, análises e atendimento

Primeira parte do painel admin no app. A API (Etapa 9) já tinha todas as rotas `/v1/admin/*`;
aqui entram só telas. Nenhuma dependência nova.

## Telas

| Tela                          | Rota                          | Protótipo / spec                                            |
| ----------------------------- | ----------------------------- | ----------------------------------------------------------- |
| Central                       | aba `central` (só admin)      | Paper "Central" + "Dashboard Admin" da spec                 |
| Adoções (lista + análise)     | `/admin/adocoes`, `/[id]`     | Spec "Gestão de Adoções"                                    |
| Doações de animais            | `/admin/doacoes-animais`, ... | Spec "Gestão de Doações de Animais" (etapa extra: RECEBIDA) |
| Voluntários                   | `/admin/voluntarios`, `/[id]` | Spec "Gestão de Voluntários" (candidaturas e ativos)        |
| Conversas (aba Chat do admin) | aba `chat`                    | Paper "Chat - Admin - Conversas"                            |
| Conversa                      | `/admin/conversas/[id]`       | Paper "Chat - Admin - Conversa"                             |

## Decisões

| Tema                         | Decisão                                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Números da Central           | Visual do Paper com os campos da spec (decisão de 22/11). O protótipo mostra "Aprovadas/Recusadas" e "Ativos", que o dashboard não devolve; a Central mostra pendentes, animais disponíveis e Pix do mês |
| Gráfico                      | Barras feitas com `View` (6 meses). Biblioteca de gráficos não se justifica para um gráfico só                                                                                                           |
| Proteção                     | `admin/_layout.tsx` redireciona quem não é ADMIN para o Início — só navegação; a API confere o papel em cada rota                                                                                        |
| Aprovar / receber            | Sempre com folha de confirmação: a ação manda e-mail e (adoção) recusa os outros pedidos do animal                                                                                                       |
| Recusar                      | Motivo obrigatório, 10–1000 caracteres (mesmo limite da API), conferido antes de enviar; o texto vai no e-mail                                                                                           |
| Conflito entre admins        | `ADOCAO_JA_ANALISADA`, `TRANSICAO_DOACAO_INVALIDA`, `CANDIDATURA_JA_ANALISADA` etc. viram mensagens claras ("Atualize a tela")                                                                           |
| Chat da equipe               | O mesmo painel do chat do usuário (`PainelConversa`, extraído do `TelaChat`) com `souEquipe`; "li" vai até a última mensagem do usuário                                                                  |
| Busca por nome nas conversas | A API não tem busca: filtro local, sem acento, sobre as conversas já carregadas                                                                                                                          |
| Dados do conversante         | Não há `GET /admin/conversas/{id}`: a tela acha a conversa na lista da equipe (todas, mais recentes primeiro)                                                                                            |
| Tempo real                   | As chaves das conversas da equipe ficam sob `['chat','conversas']`: o WebSocket já existente atualiza a lista do admin                                                                                   |

## Fica para o 10f-2

Gestão de animais (cadastro completo e fotos), conteúdo (notícias, posts, perfil da ONG, FAQ),
usuários e log de auditoria. A Central ganha os atalhos quando essas telas existirem.

## Números

App: 145 testes em 24 suítes (eram 123). Pipeline 16/16.
