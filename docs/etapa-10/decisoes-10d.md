# Etapa 10d — Início, Adotar, Doar com Pix e Doar um animal

Segunda parte visual da Etapa 10, com base nos protótipos do Paper ("Quick shell").

## Telas

| Protótipo                 | Tela                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Home (Carrossel 1, 2 e 3) | Saudação, sino com contador, carrossel e feed "Laços & Abraços" com curtida otimista             |
| Verbos do Amor            | 4 cartões; **Doar** pergunta "Pix ou doar um animal" (decisão de 22/11)                          |
| Adotar - Lista            | Grade com filtros Todos/Equinos/Caninos/Bovinos, rolagem infinita, puxar para atualizar          |
| _(sem protótipo)_         | **Detalhe do animal**: galeria, ficha (idade, sexo, porte), selos, sobre, história e apadrinhar  |
| Adotar - Aviso            | Regras + **aceite do termo** (a API exige `aceitouTermo`)                                        |
| Adotar - Formulário       | Visual do Paper com os campos da triagem: moradia, espaço adequado, motivo (50+), outros animais |
| Doar - Pix                | Valores, QR real da API, copia e cola, prazo em mm:ss, confirmação automática                    |
| _(sem protótipo)_         | **Doar um animal**: fotos (1 a 10), dados do animal, motivo e endereço de retirada               |
| _(sem protótipo)_         | **Notificações** (sino): marcar uma ou todas como lidas                                          |

Voluntariar e Jornal já estão ligados (cartão e banner) e mostram "em breve" até o 10e.

## Divergências do protótipo

| Protótipo                                  | Decisão                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Formulário de adoção com "Nome completo"   | Removido: a API já sabe quem está logado                                                      |
| "Você possui propriedade rural?"           | "Você tem espaço adequado?" + "Onde você mora?" (campos `possuiEspacoAdequado`/`tipoMoradia`) |
| Pix aparece direto com o valor selecionado | Botão **"Gerar Pix de R$ X"**: trocar de chip não cria uma cobrança por toque                 |
| "Ver tudo" no feed                         | Removido: a Início já rola o feed inteiro                                                     |
| Saudação "Olá, bem-vindo(a)"               | "Olá, {primeiro nome}!" (o texto genérico fica para quando o nome não carregou)               |
| Verbos do Amor com a barra inferior        | Tela cheia com botão voltar (abre por cima das abas, pelo banner)                             |

## Decisões técnicas

- **Rotas:** as abas foram para o grupo `(abas)`, dentro de uma pilha protegida pelo login. As
  telas cheias (detalhe, adoção, doar um animal, notificações) escondem a barra inferior.
- **QR do Pix desenhado no app** a partir do copia e cola (o texto é a fonte da verdade): um único
  `<Path>` com todos os módulos e zona de silêncio de 2 módulos.
- **Idempotency-Key por intenção:** a chave nasce ao tocar "Gerar Pix" para um valor e é reaproveitada
  se a pessoa tentar de novo o MESMO valor; troca de valor gera chave nova. Testado.
- **Dinheiro em centavos inteiros** no app; a API recebe `"25.00"` e aplica mínimo/máximo.
- **Aceite do termo** vai para o formulário como parâmetro da rota; link direto sem ele volta ao aviso.
- Em desenvolvimento, **"Simular pagamento (dev)"** chama `POST /v1/dev/pix/{id}/pagar` (só existe
  com o Pix simulado) para testar a confirmação automática no celular.

## Teste no celular e dados de exemplo

| Problema encontrado no teste real                                | Correção                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Expo lê `apps/mobile/.env`, não o da raiz                        | `apps/mobile/.env.example` + README                                 |
| Variável `EXPO_PUBLIC_API_URL` antiga no terminal vence o `.env` | README; em dev, o erro de rede mostra o endereço tentado            |
| API e S3 do Docker só aceitam `127.0.0.1`                        | API fora do Docker (`pnpm dev`) e `docker-compose.celular.yml` (S3) |
| Sem admin e sem dados, as listas ficam vazias                    | `criar-admin <e-mail>` e `semear` (pelos próprios casos de uso)     |

`semear` recusa produção e banco que já tenha animais (nunca mistura exemplos com dados reais).

## Dependências

| Pacote                       | Por quê                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `qrcode` 1.5.4               | Matriz do QR do Pix (desenho com o `react-native-svg` que já existia) |
| `expo-clipboard` ~58.0.4     | Botão "Copiar código Pix"                                             |
| `expo-image-picker` ~58.0.10 | Fotos em "Doar um animal" (só galeria; texto de permissão em pt-BR)   |

`react-native-qrcode-svg` foi descartado: puxaria `text-encoding` (descontinuado) e `prop-types`.

## Pendente com a ONG

As fotos dos banners, dos cartões e dos dados de exemplo são recortes do protótipo. Trocar pelas
fotos oficiais da ONG antes de publicar.

## Números

App: 90 testes (52 novos); API: 378 (3 novos, dados de exemplo); pipeline 16/16; bundle Android
com 5.156 módulos.
