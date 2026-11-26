# Etapa 10f-3 — Telas da equipe: conteúdo

Última parte do painel admin no app: notícias, posts, perfil da ONG e FAQ. Só telas
(rotas da Etapa 8). Nenhuma dependência nova.

## Telas

| Tela                 | Rota                                | Spec                                         |
| -------------------- | ----------------------------------- | -------------------------------------------- |
| Conteúdo (atalhos)   | `/admin/conteudo`                   | Entrada pela Central                         |
| Notícias             | `/admin/noticias`, `/nova`, `/[id]` | CRUD em Markdown, publicar/despublicar, capa |
| Posts                | `/admin/posts`, `/novo`, `/[id]`    | CRUD com imagens, publicar/despublicar       |
| Perfil da ONG        | `/admin/perfil-ong`                 | Seções SOBRE_NOS, FUNDACAO, FUNDADORES       |
| Perguntas frequentes | `/admin/faq`                        | CRUD com reordenação                         |

## Decisões

| Tema               | Decisão                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Editor de notícias | Markdown (opção da spec) com aba "Pré-visualizar" usando o mesmo renderizador do Jornal. A API sanitiza de novo no servidor |
| Rascunho primeiro  | Notícia e post nascem despublicados; capa e publicação ficam na tela de edição (a capa precisa do id)                       |
| Slug               | Gerado pela API a partir do título e mantido nas edições (links antigos não quebram); o app só mostra o endereço            |
| Imagens do post    | Escolhidas na criação (1 a 10). Depois a API permite editar só a legenda                                                    |
| Post na edição     | Não há `GET /admin/posts/{id}`: a tela acha o post na lista da equipe                                                       |
| Ordem do FAQ       | Setas subir/descer (mesmo motivo das fotos de animais: acessível, sem biblioteca de gestos)                                 |
| Remover pergunta   | Dois toques no botão dentro da folha (evita abrir uma folha de confirmação por cima de outra)                               |
| Cache público      | Cada alteração invalida também o que o público lê (Jornal, feed, perfil da ONG, FAQ)                                        |

## Também nesta parte

- Teste do atendimento esperava menos do que a tela fazia (recarga da lista depois de "assumir"): ajustado para não deixar aviso de `act`.
- Pendente (já existia): aviso de `act` no teste da cobrança Pix quando a suíte roda em paralelo.

## Números

App: 171 testes em 28 suítes (eram 160). Pipeline 16/16.
