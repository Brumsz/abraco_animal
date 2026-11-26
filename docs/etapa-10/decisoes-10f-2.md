# Etapa 10f-2 — Telas da equipe: animais, usuários e auditoria

Segunda parte do painel admin no app. Só telas (rotas da Etapa 9). Nenhuma dependência nova.

## Telas

| Tela                     | Rota                                  | Spec                                                       |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| Animais (lista)          | `/admin/animais`                      | "Lista todos os status", busca por nome/raça               |
| Novo animal / Editar     | `/admin/animais/novo`, `/[id]/editar` | "Form com todos os campos"                                 |
| Ficha do animal (equipe) | `/admin/animais/[id]`                 | Fotos (enviar, remover, reordenar), status manual, remover |
| Usuários                 | `/admin/usuarios`                     | Filtro por papel, busca, ativar/desativar, promover        |
| Auditoria                | `/admin/auditoria`                    | Lista paginada com filtros por data e admin                |

A Central ganhou os atalhos Animais, Usuários e Auditoria.

## Decisões

| Tema                      | Decisão                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reordenar fotos           | Setas "para a frente/para trás" em cada foto, não arrastar: acessível e sem biblioteca de gestos só para isto. A primeira é a capa                            |
| Fotos no cadastro         | Fotos exigem o id do animal: ao salvar um animal novo, o app abre a ficha dele para enviar as fotos                                                           |
| Status                    | Cadastro escolhe o status inicial (Disponível, Em tratamento, Indisponível). Adotado só vem da aprovação de uma adoção (regra da API)                         |
| Listagem de animais       | Usa `GET /v1/animais`: com token da equipe a API devolve todos os status                                                                                      |
| Busca (animais, usuários) | Espera 400 ms sem digitar antes de consultar (`useAtrasado`): sem uma chamada por letra                                                                       |
| Usuários da equipe        | Contas ADMIN e a própria conta aparecem sem ações (a API recusa: `ALVO_E_ADMIN`, `ACAO_NA_PROPRIA_CONTA`)                                                     |
| Auditoria no celular      | A "tabela" vira lista: ação em português, admin, data/hora, entidade e ID, detalhe resumido. Período por chips (7/30/90 dias, tudo) em vez de seletor de data |

## Fica para o 10f-3

Gestão de conteúdo: notícias, posts (com imagens), perfil da ONG e FAQ.

## Números

App: 160 testes em 26 suítes (eram 145). Pipeline 16/16.
