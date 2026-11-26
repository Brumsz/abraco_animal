# Etapa 11b — CI/CD (tudo gratuito, sem deploy por enquanto)

Decisão do usuário (26/11): **deixar tudo pronto sem deploy** e usar só serviços gratuitos.
O repositório é público, então GitHub Actions, CodeQL e GHCR não custam nada.

## Pipeline (seção 10 da spec)

| #   | Item da spec                          | Onde                                  | Situação                                                                             |
| --- | ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Lint e typecheck                      | `ci.yml` → verificar                  | Já existia                                                                           |
| 2   | Testes unitários                      | `ci.yml` → verificar                  | Já existia                                                                           |
| 3   | Integração (Testcontainers)           | `ci.yml` → integracao                 | Já existia                                                                           |
| 4   | SAST                                  | `codeql.yml`                          | **Novo**: CodeQL `security-extended` em PR, na main e toda segunda                   |
| 5   | Auditoria de dependências + Renovate  | `ci.yml` → auditoria, `renovate.json` | **Novo**                                                                             |
| 6   | Build e scan da imagem (Trivy)        | `ci.yml` → imagem                     | **Novo**: falha com alta/crítica corrigível; relatório na aba Security; GHCR na main |
| 7   | Deploy em staging                     | —                                     | **Desligado** (decisão do usuário). Ver "Como ligar o deploy"                        |
| 8   | E2E (Maestro)                         | `e2e.yml` + `apps/mobile/.maestro`    | **Novo**: manual e semanal (≈30 min)                                                 |
| 9   | Promoção para produção                | —                                     | **Desligado**, junto com o deploy                                                    |
| —   | Mobile: EAS Build + Update com canais | `eas.yml` + `apps/mobile/eas.json`    | **Novo**, desligado até existir o segredo `EXPO_TOKEN`                               |

## Decisões

| Tema                       | Decisão                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O que a auditoria bloqueia | Alta ou crítica em **dependências de produção**. As de desenvolvimento só geram aviso (hoje: `effect`, usado só pela CLI do Prisma ao ler a configuração)                                            |
| Trivy                      | Roda pela imagem oficial `aquasec/trivy:0.76.2`, sem action de terceiro (menos superfície de ataque na cadeia de CI). `--ignore-unfixed`: só falha quando há correção                                |
| Publicação da imagem       | GHCR, tags `<sha>` e `main`, **só depois do scan** e só a partir da main                                                                                                                             |
| Renovate                   | Segunda de manhã; versões com **14 dias** de publicadas (mesma regra usada no 11a); alertas de segurança a qualquer hora; Expo fica de fora (atualizar com `npx expo install --fix` junto com o SDK) |
| E2E                        | Build release com o bundle embutido; `usesCleartextTraffic` liberado **só nesse build de teste** (a API do CI é HTTP local). Segredos gerados na hora                                                |
| EAS                        | Canais `development`, `preview`, `production`. Push na main → atualização OTA no `preview`; builds nativas à mão                                                                                     |

## O que você precisa fazer (uma vez, tudo gratuito)

1. **Renovate**: instalar o app gratuito "Renovate" no repositório (github.com/apps/renovate).
2. **EAS** (quando quiser publicar o app):
   - criar conta em expo.dev; em `apps/mobile`, rodar `npx eas-cli init` (grava o `projectId` no `app.json`);
   - criar um token em expo.dev → Access tokens e salvar como segredo `EXPO_TOKEN` no GitHub
     (Settings → Secrets and variables → Actions).
3. **E2E**: nada a configurar — Actions → "E2E (Maestro)" → Run workflow.

## Como ligar o deploy depois

A imagem já fica pronta em `ghcr.io/brumsz/abraco_animal/api:main`. Para uma hospedagem
(Student Pack, Oracle Cloud Always Free, Render, Railway…): criar um ambiente `staging` no
GitHub com os segredos da API (`DATABASE_URL`, chaves etc.) e um job que use a imagem `<sha>`.
Produção: ambiente `production` com aprovação manual. Lembrar de `TRUST_PROXY_HOPS=1` atrás
do proxy da hospedagem e de `SENTRY_RELEASE=<sha>`.

## Não verificado aqui

Os workflows novos (`imagem`, `codeql`, `e2e`, `eas`) só rodam no GitHub. O YAML foi validado
localmente; o resultado real aparece na primeira execução no PR (`imagem`, `codeql`) e no
primeiro disparo manual (`e2e`).
