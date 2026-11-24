# Etapa 10e-2 — Telas de conta, Voluntariar, Jornal, Perfil da ONG e Chat

Visual do Paper ("Quick shell"); campos e regras da spec/API quando divergem (decisão de 22/11).
Usa as rotas de "minha conta" do 10e-1 (PR #15).

## Telas

| Rota                        | Protótipo            | O que faz                                                            |
| --------------------------- | -------------------- | -------------------------------------------------------------------- |
| aba Perfil                  | Perfil               | Capa, foto, papel, números (`GET /me/resumo`) e o menu da conta      |
| `/perfil/editar`            | Editar perfil        | Nome, telefone e endereço (`PATCH /me`); e-mail só leitura           |
| `/configuracoes`            | Configurações        | Senha, e-mail/telefone, exportar dados, termos, excluir conta e Sair |
| `/configuracoes/senha`      | —                    | Trocar senha (outros aparelhos saem da conta)                        |
| `/configuracoes/excluir`    | —                    | Excluir conta: senha + caixa "entendo que é definitiva"              |
| `/configuracoes/termos`     | —                    | Resumo de como o app trata os dados (LGPD)                           |
| `/minhas-adocoes`           | (menu do Perfil)     | Pedidos de adoção e a resposta da equipe                             |
| `/minhas-doacoes`           | (menu do Perfil)     | Histórico de Pix e de animais doados                                 |
| `/voluntariar`              | Voluntariar          | Candidatura (áreas, dias, turnos, motivação) e o andamento dela      |
| `/jornal`, `/jornal/[slug]` | Jornal               | Lista de notícias e leitura                                          |
| `/ong`                      | Perfil ONG (4 telas) | Sobre nós, Fundação, Fundadores e Dúvidas (sanfona) + Instagram      |
| aba Chat                    | Chat - Usuário       | Conversa com a equipe em tempo real                                  |

## Decisões

| Tema                       | Decisão                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPF e nascimento no Editar | O protótipo mostra o CPF só para leitura, mas a API **nunca** devolve CPF (só na exportação LGPD). Fora da tela                                                         |
| "Cidade e CEP" num campo   | A API guarda o endereço em partes (a adoção precisa dele): CEP, UF, cidade, bairro, rua, número, complemento                                                            |
| Foto de perfil (câmera)    | Não existe rota de foto ainda; o avatar mostra as iniciais. Fica para quando a rota existir                                                                             |
| Notificações (push/e-mail) | Seção do protótipo **fora**: o push chega na Etapa 11 e não há preferências na API. Botão que não faz nada engana                                                       |
| Exportar dados             | Aviso antes ("tem CPF e nascimento") e compartilhamento pelo `Share` do sistema. Nunca entra no cache                                                                   |
| Excluir conta              | Senha + confirmação explícita; ao concluir, o app limpa o aparelho e volta ao login                                                                                     |
| Nome na saudação           | Salvar o perfil atualiza a sessão: a Home passa a mostrar o novo nome na hora                                                                                           |
| Voluntariar "Cargo"        | Trocado por áreas de interesse, dias e turnos (campos da API). O cargo é a equipe que define ao aprovar                                                                 |
| Markdown das notícias      | Leitor próprio e pequeno (títulos, listas, citações, negrito, itálico, links), **sem HTML e sem WebView**. Link só abre se for http(s)/mailto. Nenhuma dependência nova |
| Instagram                  | `EXPO_PUBLIC_INSTAGRAM_URL` (só `https://instagram.com/...`); sem ela o botão não aparece                                                                               |
| Chat                       | Uma conversa aberta por pessoa (regra da API); sem conversa, a 1ª mensagem abre uma. "Visto" e "Digitando…"                                                             |
| Chat do admin              | A aba mostra "em construção" para o admin: o atendimento da equipe vem com as telas de admin (10f)                                                                      |
| Abas com chips             | Anunciadas como grupo de opções (radiogroup), coerente com o papel "radio" dos chips                                                                                    |

## Novos componentes compartilhados

`ListaOpcoes` (menus do Perfil/Configurações), `TelaFormulario` (voltar + título + campos + ação fixa),
`ListaPaginada` (rolagem infinita com carregando/erro/vazio/atualizar) e `CartaoPedido` (históricos).

## Números

App: 123 testes (eram 91), 22 suítes. Pipeline 16/16.
