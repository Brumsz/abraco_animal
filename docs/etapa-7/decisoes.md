# Etapa 7 — Doações via Pix (Asaas, por enquanto simulado)

## Arquitetura

```
shared/dominio/dinheiro.ts                    value object em centavos inteiros (seção 9)
modules/doacoes-financeiras/domain/           limites de valor, doador, status efetivo, valor pago
modules/doacoes-financeiras/application/      gerar Pix, "Já paguei", webhook, histórico
modules/doacoes-financeiras/infrastructure/
  gateway-asaas.ts                            Asaas real (API v3, fetch nativo)
  gateway-simulado.ts                         PSP simulado (BR Code válido, chave .invalid)
  prisma-repositorio-doacoes-financeiras.ts   confirmação + WebhookEvento na mesma transação
modules/doacoes-financeiras/http/             rotas, webhook com token, rota de simulação (dev)
```

## Rotas

| Rota                                      | Acesso                   | Observação                                                             |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `POST /v1/doacoes-financeiras`            | público (login opcional) | Header `Idempotency-Key` (UUID) obrigatório. 10/hora por usuário ou IP |
| `GET /v1/doacoes-financeiras/{id}/status` | público                  | "Já paguei": reconsulta o PSP. 20/min por doação+IP                    |
| `GET /v1/me/doacoes-financeiras`          | logado                   | Histórico                                                              |
| `POST /v1/webhooks/asaas`                 | Asaas (token)            | Fora do rate limit global (autenticado e deduplicado)                  |
| `POST /v1/dev/pix/{id}/pagar`             | **só desenvolvimento**   | Existe apenas com o PSP simulado e fora de produção                    |

## Segurança do pagamento (seção 6)

| Ameaça                                                    | Defesa                                                                                                          | Teste |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| App manda `status: "CONFIRMADA"` (ou `paidAt`, `pspTxId`) | Zod estrito → 400. Não existe rota que altere status                                                            | ✅    |
| "Já paguei" sem ter pago                                  | O status só muda depois de **reconsultar o PSP**                                                                | ✅    |
| Webhook sem token / token errado                          | 401. Comparação em tempo constante (SHA-256 + `timingSafeEqual`)                                                | ✅    |
| Webhook **forjado com o token certo** (token vazado)      | O corpo só diz QUAL cobrança olhar; se o PSP disser que não foi paga, nada muda                                 | ✅    |
| Corpo do webhook com valor/status mentiroso               | Ignorado: valem o status e o valor da reconsulta                                                                | ✅    |
| PSP diz "pago", mas com valor diferente do cobrado        | Não confirma; registra para análise manual                                                                      | ✅    |
| O mesmo evento várias vezes, inclusive em paralelo        | `WebhookEvento` UNIQUE(provedor, eventoId) **na mesma transação** da confirmação → 1 confirmação, 1 comprovante | ✅    |
| PSP fora do ar durante o webhook                          | 502 e o evento **não** fica registrado: o reenvio do Asaas é aceito                                             | ✅    |
| Toque duplo em "Gerar Pix" / retry de rede                | Idempotency-Key → a mesma cobrança (também com 2 requisições simultâneas reais)                                 | ✅    |
| Idempotency-Key reaproveitada para outra doação           | 409 `IDEMPOTENCY_KEY_REUSADA`                                                                                   | ✅    |
| Token do webhook nos logs                                 | Header redigido no logger                                                                                       | ✅    |
| Produção com o PSP simulado                               | A API não sobe sem `ASAAS_API_KEY` em produção                                                                  | ✅    |

## Decisões

| Tema                  | Decisão                                                                                                    | Motivo                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PSP nesta etapa       | **Simulado** (decisão do usuário); o adaptador real já existe e é testado contra respostas falsas do Asaas | Ligar a conta real depois = preencher 2 variáveis                                                         |
| Valor                 | R$ 5,00 a R$ 10.000,00 por Pix; centavos inteiros (`Dinheiro`)                                             | Mínimo da spec; o máximo protege contra erro de digitação e fraude. Nada de ponto flutuante               |
| Pagamento após 15 min | **Aceito** (EXPIRADA → CONFIRMADA)                                                                         | O dinheiro entrou. Ao expirar, a cobrança é cancelada no PSP para ninguém pagar o QR vencido              |
| Expiração             | Calculada na leitura (PENDENTE vencida aparece EXPIRADA) e gravada no "Já paguei"                          | Sem job agendado; o Asaas trabalha com vencimento por dia                                                 |
| Cliente no Asaas      | **Um único cliente da ONG** (`ASAAS_CLIENTE_ID`) para todas as doações                                     | O Asaas exige cliente com CPF/CNPJ; assim o doador não informa CPF e nenhum dado dele vai para o Asaas    |
| QR Code               | O app gera a imagem a partir do copia-e-cola (decisão D8)                                                  | —                                                                                                         |
| Webhook não estrito   | `looseObject` no corpo do webhook                                                                          | Exceção à regra "Zod estrito": o Asaas manda dezenas de campos. Só `id`, `event` e `payment.id` são lidos |
| Anônima               | Logado + "Doe sem identificação": continua no histórico dele; a equipe verá "Anônimo" (painel, Etapa 9)    | —                                                                                                         |
| Comprovante           | E-mail da conta (logado) ou `emailDoador` (sem login); sem e-mail, sem comprovante                         | —                                                                                                         |
| Simulador             | BR Code com CRC16 válido (o app desenha o QR), chave `pix-simulado@abracoanimal.invalid`                   | Nenhum banco consegue pagar um código simulado                                                            |

## Para ligar o Asaas real (sandbox)

1. Criar a conta em https://sandbox.asaas.com e gerar a **chave de API** (Integrações → Chave de API).
2. Cadastrar **um cliente** com o nome e o CNPJ da ONG e copiar o id (`cus_…`).
3. Em Integrações → Webhooks: URL `https://<api>/v1/webhooks/asaas`, eventos de cobrança, e o
   **token de autenticação** = o mesmo valor de `ASAAS_WEBHOOK_TOKEN` do `.env`.
4. No `.env`: `ASAAS_API_KEY=…` e `ASAAS_CLIENTE_ID=cus_…`. A rota `/dev/pix/...` some sozinha.
5. Rodar o teste manual: gerar um Pix e pagá-lo no painel do sandbox ("Confirmar pagamento").

Em desenvolvimento local, o Asaas não alcança `localhost`: use um túnel (ex.: `cloudflared`)
para o webhook, ou o botão "Já paguei", que consulta o Asaas diretamente.

## Testes

| Tipo                                | Quantidade           |
| ----------------------------------- | -------------------- |
| Unitários da API (todos os módulos) | 289                  |
| Integração (todos os módulos)       | 91 (18 novos de Pix) |

Cobertura de domínio + casos de uso: **98,6% linhas / 92,7% ramos** (meta 85%).

Fumaça no docker-compose: gerar Pix, "Já paguei" sem pagar → PENDENTE, webhook com token errado
→ 401, pagamento simulado → CONFIRMADA, comprovante no Mailpit. Os logs não têm e-mail, token
nem copia-e-cola.
