/**
 * O contrato é gerado das rotas reais: dá para checar, numa tacada, que
 * NENHUMA resposta da API expõe campos sensíveis.
 */
import { describe, expect, it } from 'vitest';

import { gerarOpenapi } from './gerar.js';

interface Operacao {
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

interface Documento {
  paths: Record<string, Record<string, Operacao>>;
}

/** Todos os nomes de propriedade de um JSON Schema (recursivo). */
function propriedades(schema: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const s of schema) propriedades(s, acc);
  } else if (schema && typeof schema === 'object') {
    const props = (schema as { properties?: Record<string, unknown> }).properties;
    if (props) for (const nome of Object.keys(props)) acc.add(nome);
    for (const v of Object.values(schema)) propriedades(v, acc);
  }
  return acc;
}

const SENSIVEIS = [
  'senha',
  'senhaHash',
  'cpf',
  'cpfHash',
  'cpfCifrado',
  'dataNasc',
  'refreshTokenHash',
  'codigoHash',
  'pspTxId',
  'idempotencyKey',
];

describe('OpenAPI gerado das rotas', () => {
  it('cobre todos os módulos e esconde o WebSocket (documentado à parte)', async () => {
    const doc = (await gerarOpenapi()) as Documento;
    const caminhos = Object.keys(doc.paths);
    for (const c of [
      '/v1/auth/login',
      '/v1/animais',
      '/v1/adocoes',
      '/v1/doacoes-animais',
      '/v1/doacoes-financeiras',
      '/v1/webhooks/asaas',
      '/v1/apadrinhamentos',
      '/v1/voluntariado/candidaturas',
      '/v1/institucional/perfil',
      '/v1/posts',
      '/v1/noticias',
      '/v1/conversas',
      '/v1/notificacoes',
      '/v1/admin/dashboard',
    ]) {
      expect(caminhos, c).toContain(c);
    }
    expect(caminhos).not.toContain('/v1/ws/chat');
  });

  it('nenhuma RESPOSTA tem senha, CPF, data de nascimento, hashes ou ids internos do PSP', async () => {
    const doc = (await gerarOpenapi()) as Documento;
    const vazamentos: string[] = [];
    for (const [caminho, metodos] of Object.entries(doc.paths)) {
      for (const [metodo, op] of Object.entries(metodos)) {
        for (const resposta of Object.values(op.responses ?? {})) {
          for (const nome of propriedades(resposta.content)) {
            if (SENSIVEIS.includes(nome))
              vazamentos.push(`${metodo.toUpperCase()} ${caminho}: ${nome}`);
          }
        }
      }
    }
    expect(vazamentos).toEqual([]);
  });
});
