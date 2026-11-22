# Etapa 10c — Visual do Paper, navegação e telas de entrada

Primeira parte visual da Etapa 10. Base: protótipos do arquivo "Quick shell" no Paper.

## Decisões do usuário (22/11)

| Tema           | Decisão                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| Formulários    | **Visual do Paper, campos da spec/API** (adoção e voluntariado não mudam a API)            |
| Doar um animal | Existe: o cartão "Doar" do Verbos do Amor oferece Pix ou doar um animal (aba Doar = Pix)   |
| Plano          | 10c design + navegação + entrada · 10d início/adotar/Pix · 10e perfil/ONG/chat · 10f admin |

## Design system (`packages/ui`)

Tokens trocados pelos do Paper, com nomes em português equivalentes (`bg-app` → `fundo`,
`ink-strong` → `tinta`, `brand` → `marca`…). Fontes: **Plus Jakarta Sans** (títulos e botões) e Inter.

| Divergência do protótipo                                       | Decisão                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Texto branco sobre `#D9480F` = 4,3:1 (abaixo de AA para 16 px) | Fundo dos botões em `marcaEscura` `#B93A0A` (5,7:1), token do próprio Paper  |
| Links laranja `#D9480F` em 13 px sobre o creme                 | `marcaEscura` (5,4:1)                                                        |
| Rótulos da barra inferior em 11 px                             | 12 px                                                                        |
| Campos de login só com placeholder                             | Mantido o visual; o nome do campo vai para o leitor de tela (`rotuloOculto`) |

Componentes novos: `Chip` (filtros e escolhas), `BotaoVoltar`, `CampoCodigo` (aceita colar o
código e o preenchimento automático), `CaixaSelecao`. `Button` ganhou a variante `contorno`;
`Input` segue o protótipo (ícone à esquerda, rótulo acima nos formulários).

## Telas

| Protótipo                           | Tela                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Splash - Início / Login / Recuperar | `SplashMarca` na abertura, depois de entrar e antes da recuperação                                                                                               |
| Login                               | Conectado à API; erros por código (`CREDENCIAIS_INVALIDAS`, `CONTA_DESATIVADA`, 429…)                                                                            |
| Cadastrar                           | **2 passos**: o protótipo tem "Cidade e CEP" num campo, mas a adoção exige o endereço completo; o passo 2 pede endereço + aceite dos termos + consentimento LGPD |
| Recuperar senha (3 passos)          | E-mail → código (reenviar após 60 s) → nova senha; e-mail e token só na memória                                                                                  |
| Componentes - Navegação             | Barra flutuante com Doar elevado; admin vê Central no lugar de Doar                                                                                              |

As abas (Início, Adotar, Doar, Central, Chat, Perfil) estão com tela provisória até o 10d/10e.

## Regras iguais no app e na API

CPF, telefone, política de senha e idade mínima foram para `@abraco/shared/validacoes`: a API
continua decidindo, e o app avisa antes de enviar **com as mesmas regras**.

## Problemas encontrados

| Problema                                                      | Correção                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Testes de tela passavam mas o Jest levava 4 min para encerrar | Timer de limpeza do QueryClient (5 min) desligado nos testes: 28 s |
| Rotas tipadas desatualizadas após criar telas                 | Regeradas pelo Expo (`.expo/types`, fora do git)                   |

## Dependências

| Mudança                                       | Por quê                       |
| --------------------------------------------- | ----------------------------- |
| `@expo-google-fonts/plus-jakarta-sans` ~0.4.2 | Fonte de títulos do protótipo |
| − `@expo-google-fonts/poppins`                | Não é mais usada              |

A logo é a arte do protótipo (exportada do Paper em 3x). Se a ONG enviar o arquivo oficial,
basta trocar `apps/mobile/assets/imagens/logo.png`.

## Números

App: 38 testes (15 novos); UI: 17 (4 novos); shared: 5 novos; pipeline 16/16; bundle Android OK.
