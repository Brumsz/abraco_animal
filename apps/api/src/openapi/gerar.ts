/**
 * Gera o OpenAPI a partir das rotas reais (esquemas Zod) e grava em
 * packages/api-client/openapi.json. Uso: pnpm --filter @abraco/api openapi:gerar
 *
 * As dependências são "falsas": só o REGISTRO das rotas importa aqui — nenhum
 * handler é executado, nada conecta em banco, Redis ou S3.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { construirApp, type OpcoesApp } from '../app.js';

/** Objeto que aceita qualquer acesso/chamada (substitui casos de uso e plugins). */
function falso(): never {
  const alvo = function () {
    return proxy;
  };
  const proxy: unknown = new Proxy(alvo, {
    // `then` e símbolos (isConcatSpreadable, iterator…) indefinidos: senão o `await`
    // e o `concat` do Fastify tratariam o proxy como Promise/array.
    get: (_alvo, chave) => (chave === 'then' || typeof chave === 'symbol' ? undefined : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

const MODULOS = [
  'auth',
  'animais',
  'adocoes',
  'doacoesAnimais',
  'pix',
  'apadrinhamentos',
  'voluntariado',
  'institucional',
  'feed',
  'noticias',
  'admin',
  'notificacoes',
  'conta',
  'push',
] as const;

/** Ordena as chaves para o arquivo gerado não mudar à toa (diff estável no CI). */
function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordenar(v)]),
    );
  }
  return valor;
}

export async function gerarOpenapi(): Promise<object> {
  const opcoes: OpcoesApp = {
    gerarOpenapi: true,
    ...Object.fromEntries(MODULOS.map((m) => [m, falso()])),
    chat: { rotas: falso(), websocket: falso() },
  };
  const app = construirApp(opcoes);
  await app.ready();
  const documento = app.swagger();
  await app.close();
  return ordenar(documento) as object;
}

const destino = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/api-client/openapi.json',
);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const documento = await gerarOpenapi();
  writeFileSync(destino, `${JSON.stringify(documento, null, 2)}\n`);
  process.stdout.write(`OpenAPI gerado em ${destino}
`);
}
