# @abraco/api-client

Cliente tipado da API Abraço Animal, usado pelo app.

## De onde vêm os tipos

```
apps/api (rotas + esquemas Zod)
   └── pnpm api:gerar ──▶ packages/api-client/openapi.json  ──▶ src/esquema.ts
```

O contrato é **gerado das rotas reais**: se uma rota mudar e ninguém regenerar, o CI falha.
Não edite `openapi.json` nem `src/esquema.ts` à mão.

## Uso

```ts
import { criarClienteApi, ok, ErroApi } from '@abraco/api-client';

const api = criarClienteApi({
  baseUrl: 'https://api.abracoanimal.org.br',
  obterToken: () => tokenEmMemoria,
  renovar: async () => /* POST /v1/auth/refresh → novo access token ou null */ null,
  aoPerderSessao: () => irParaLogin(),
});

const pagina = await ok(api.GET('/v1/animais', { params: { query: { limite: 20 } } }));
//    ^ tipado: { itens: AnimalResumo[]; proximoCursor: string | null }

try {
  await ok(api.POST('/v1/adocoes', { body: triagem }));
} catch (e) {
  if (e instanceof ErroApi && e.codigo === 'ANIMAL_NAO_DISPONIVEL') {
    /* … */
  }
}
```

- 401 fora de `/auth` → **uma** renovação (chamadas simultâneas esperam a mesma) e a chamada é repetida.
- Uploads multipart: `doarAnimal`, `enviarFotosAnimal`, `criarPost`, `definirCapaNoticia`.
- Tempo real: `ChatTempoReal` (WebSocket com autenticação na 1ª mensagem e reconexão automática).

## Protocolo do WebSocket (`/v1/ws/chat`)

| Direção            | Mensagem                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| cliente → servidor | `{tipo:"auth", token}` (1ª, em até 5 s) · `{tipo:"digitando", conversaId}` · `{tipo:"ping"}`         |
| servidor → cliente | `auth.ok` · `mensagem.nova` · `mensagem.lida` · `conversa.encerrada` · `digitando` · `pong` · `erro` |
| fechamentos        | 4401 sem auth/token inválido/sessão revogada · 4400 formato · 4429 excesso                           |

Mensagens de chat são enviadas **só** pela REST (`POST /v1/conversas/{id}/mensagens`).
