import { randomUUID } from 'node:crypto';

import type { StatusVoluntario } from '@abraco/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import type { DadosCandidatura, EntradaCandidatura } from '../domain/candidatura.js';
import {
  AdminListarCandidaturas,
  AdminObterCandidatura,
  AprovarCandidatura,
  Candidatar,
  ObterMinhaCandidatura,
  RecusarCandidatura,
  type CandidaturaRegistro,
  type RepositorioCandidaturas,
} from './casos-de-uso.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

class CandidaturasFake implements RepositorioCandidaturas {
  readonly lista: Mutavel<CandidaturaRegistro>[] = [];
  readonly roles = new Map<string, string>();
  readonly notificacoes: ConteudoNotificacao[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private t = Date.parse('2026-11-01T12:00:00Z');

  buscarDoUsuario(usuarioId: string) {
    return Promise.resolve(this.lista.find((c) => c.candidato.publicId === usuarioId) ?? null);
  }
  buscar(publicId: string) {
    return Promise.resolve(this.lista.find((c) => c.publicId === publicId) ?? null);
  }
  salvar(usuarioId: string, dados: DadosCandidatura) {
    this.t += 1000;
    const existente = this.lista.find((c) => c.candidato.publicId === usuarioId);
    if (existente) {
      Object.assign(existente, dados, {
        status: 'PENDENTE',
        motivoRecusa: null,
        analisadoEm: null,
      });
      return Promise.resolve({ ...existente });
    }
    const nova: Mutavel<CandidaturaRegistro> = {
      ...dados,
      id: this.lista.length + 1,
      publicId: randomUUID(),
      status: 'PENDENTE',
      cargo: null,
      motivoRecusa: null,
      analisadoEm: null,
      criadoEm: new Date(this.t),
      candidato: {
        publicId: usuarioId,
        nome: 'Maria Souza',
        email: `${usuarioId}@teste.org`,
        telefone: '11987654321',
        cidade: 'São Paulo',
        uf: 'SP',
      },
    };
    this.lista.push(nova);
    return Promise.resolve({ ...nova });
  }
  listar(filtro: { status?: StatusVoluntario }, _c: unknown, limite: number) {
    return Promise.resolve(
      this.lista.filter((c) => !filtro.status || c.status === filtro.status).slice(0, limite),
    );
  }
  aprovar(
    c: CandidaturaRegistro,
    d: {
      em: Date;
      cargo: string | null;
      auditoria: EntradaAuditoria;
      notificacao: ConteudoNotificacao;
    },
  ) {
    const alvo = this.lista.find((x) => x.id === c.id);
    if (alvo) Object.assign(alvo, { status: 'APROVADO', cargo: d.cargo, analisadoEm: d.em });
    if (this.roles.get(c.candidato.publicId) === 'USUARIO')
      this.roles.set(c.candidato.publicId, 'VOLUNTARIO');
    this.notificacoes.push(d.notificacao);
    this.auditoria.push(d.auditoria);
    return Promise.resolve();
  }
  recusar(
    c: CandidaturaRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ) {
    const alvo = this.lista.find((x) => x.id === c.id);
    if (alvo)
      Object.assign(alvo, { status: 'RECUSADO', motivoRecusa: d.motivo, analisadoEm: d.em });
    this.notificacoes.push(d.notificacao);
    this.auditoria.push(d.auditoria);
    return Promise.resolve();
  }
}

class EmailsFake {
  readonly enviados: string[] = [];
  candidaturaRecebida() {
    this.enviados.push('recebida');
    return Promise.resolve();
  }
  voluntarioAprovado() {
    this.enviados.push('aprovado');
    return Promise.resolve();
  }
  voluntarioRecusado(d: { motivo: string }) {
    this.enviados.push(`recusado:${d.motivo}`);
    return Promise.resolve();
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const MARIA: Ator = { id: 'maria', role: 'USUARIO' };

let repo: CandidaturasFake;
let emails: EmailsFake;
let deps: { candidaturas: CandidaturasFake; emails: EmailsFake; relogio: RelogioFake };

beforeEach(() => {
  repo = new CandidaturasFake();
  repo.roles.set('maria', 'USUARIO');
  emails = new EmailsFake();
  deps = { candidaturas: repo, emails, relogio: new RelogioFake() };
});

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
}

const dados = (extra: Partial<EntradaCandidatura> = {}): EntradaCandidatura => ({
  areasInteresse: ['CUIDADO_ANIMAIS', 'CUIDADO_ANIMAIS', 'EVENTOS'],
  disponibilidadeDias: ['SABADO', 'DOMINGO'],
  turnos: ['MANHA'],
  motivacao: '  Cresci no interior cuidando de cavalos e quero ajudar.  ',
  habilidades: '   ',
  ...extra,
});

const candidatar = (ator: Ator = MARIA, extra: Partial<EntradaCandidatura> = {}) =>
  new Candidatar(deps).executar({ ator, dados: dados(extra) });

describe('candidatura', () => {
  it('cria PENDENTE com listas sem repetição, textos aparados e e-mail', async () => {
    const r = await candidatar();
    expect(r).toMatchObject({
      status: 'PENDENTE',
      areasInteresse: ['CUIDADO_ANIMAIS', 'EVENTOS'],
      motivacao: 'Cresci no interior cuidando de cavalos e quero ajudar.',
      habilidades: null,
      areaInteresseOutros: null,
    });
    expect(emails.enviados).toEqual(['recebida']);
  });

  it('OUTROS exige descrever a área; sem OUTROS, o texto é descartado', async () => {
    expect(await codigoDe(candidatar(MARIA, { areasInteresse: ['OUTROS'] }))).toBe(
      'CAMPO_OBRIGATORIO',
    );
    const r = await candidatar(MARIA, { areaInteresseOutros: 'Fotografia' });
    expect(r.areaInteresseOutros).toBeNull();
  });

  it('listas vazias e motivação curta → erro', async () => {
    expect(await codigoDe(candidatar(MARIA, { turnos: [] }))).toBe('CAMPO_OBRIGATORIO');
    expect(await codigoDe(candidatar(MARIA, { disponibilidadeDias: [] }))).toBe(
      'CAMPO_OBRIGATORIO',
    );
    expect(await codigoDe(candidatar(MARIA, { motivacao: '  quero ajudar  ' }))).toBe(
      'MOTIVACAO_CURTA',
    );
  });

  it('em análise → 409; voluntário ou admin → 409; recusada → pode reenviar', async () => {
    const { id } = await candidatar();
    expect(await codigoDe(candidatar())).toBe('CANDIDATURA_EM_ANALISE');
    expect(await codigoDe(candidatar({ id: 'ana', role: 'VOLUNTARIO' }))).toBe('JA_E_DA_EQUIPE');
    expect(await codigoDe(candidatar(ADMIN))).toBe('JA_E_DA_EQUIPE');

    await new RecusarCandidatura(deps).executar({
      ator: ADMIN,
      id,
      motivo: 'Faltou disponibilidade.',
    });
    const reenvio = await candidatar();
    expect(reenvio).toMatchObject({ id, status: 'PENDENTE', motivoRecusa: null });
  });

  it('minha candidatura: 404 quando não existe', async () => {
    expect(await codigoDe(new ObterMinhaCandidatura(deps).executar({ ator: MARIA }))).toBe(
      'CANDIDATURA_NAO_ENCONTRADA',
    );
    await candidatar();
    expect((await new ObterMinhaCandidatura(deps).executar({ ator: MARIA })).status).toBe(
      'PENDENTE',
    );
  });
});

describe('análise pelo admin', () => {
  it('aprovar: promove a VOLUNTARIO, guarda o cargo, notifica, audita e manda e-mail', async () => {
    const { id } = await candidatar();
    const r = await new AprovarCandidatura(deps).executar({
      ator: ADMIN,
      id,
      cargo: '  Cuidadora  ',
    });
    expect(r).toMatchObject({
      status: 'APROVADO',
      cargo: 'Cuidadora',
      candidato: { nome: 'Maria Souza' },
    });
    expect(repo.roles.get('maria')).toBe('VOLUNTARIO');
    expect(repo.notificacoes.map((n) => n.tipo)).toEqual(['VOLUNTARIADO_ATUALIZADO']);
    expect(repo.auditoria[0]).toMatchObject({
      acao: 'VOLUNTARIO_APROVADO',
      detalhe: { cargo: 'Cuidadora' },
    });
    expect(emails.enviados.at(-1)).toBe('aprovado');
  });

  it('recusar: motivo vai para a candidatura e o e-mail, não para a notificação nem a auditoria', async () => {
    const { id } = await candidatar();
    await new RecusarCandidatura(deps).executar({
      ator: ADMIN,
      id,
      motivo: 'Precisamos de disponibilidade à tarde.',
    });
    expect(repo.lista[0]?.motivoRecusa).toBe('Precisamos de disponibilidade à tarde.');
    expect(JSON.stringify(repo.notificacoes)).not.toContain('tarde');
    expect(JSON.stringify(repo.auditoria)).not.toContain('tarde');
    expect(emails.enviados.at(-1)).toBe('recusado:Precisamos de disponibilidade à tarde.');
  });

  it('já analisada → conflito; cargo longo → erro', async () => {
    const { id } = await candidatar();
    expect(
      await codigoDe(
        new AprovarCandidatura(deps).executar({ ator: ADMIN, id, cargo: 'x'.repeat(81) }),
      ),
    ).toBe('CAMPO_MUITO_LONGO');
    await new AprovarCandidatura(deps).executar({ ator: ADMIN, id });
    expect(await codigoDe(new AprovarCandidatura(deps).executar({ ator: ADMIN, id }))).toBe(
      'CANDIDATURA_JA_ANALISADA',
    );
    expect(
      await codigoDe(
        new RecusarCandidatura(deps).executar({ ator: ADMIN, id, motivo: 'Motivo suficiente.' }),
      ),
    ).toBe('CANDIDATURA_JA_ANALISADA');
  });

  it('só ADMIN: o caso de uso valida a role', async () => {
    const { id } = await candidatar();
    const ana: Ator = { id: 'ana', role: 'VOLUNTARIO' };
    for (const p of [
      new AdminListarCandidaturas(deps).executar({ ator: MARIA }),
      new AdminObterCandidatura(deps).executar({ ator: ana, id }),
      new AprovarCandidatura(deps).executar({ ator: MARIA, id }),
      new RecusarCandidatura(deps).executar({ ator: ana, id, motivo: 'Motivo suficiente.' }),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
  });

  it('listar filtra por status; inexistente → 404', async () => {
    await candidatar();
    const p = await new AdminListarCandidaturas(deps).executar({ ator: ADMIN, status: 'APROVADO' });
    expect(p.itens).toEqual([]);
    expect((await new AdminListarCandidaturas(deps).executar({ ator: ADMIN })).itens).toHaveLength(
      1,
    );
    expect(
      await codigoDe(new AdminObterCandidatura(deps).executar({ ator: ADMIN, id: randomUUID() })),
    ).toBe('CANDIDATURA_NAO_ENCONTRADA');
  });
});
