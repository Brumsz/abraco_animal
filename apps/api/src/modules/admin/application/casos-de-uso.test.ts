import type { Role } from '@abraco/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import {
  AdminListarUsuarios,
  AlterarAtivoUsuario,
  AlterarRoleUsuario,
  ConsultarAuditoria,
  ObterDashboard,
  type AuditoriaRegistro,
  type CursorPainel,
  type FiltroAuditoria,
  type Pendencia,
  type RepositorioAuditoria,
  type RepositorioPainel,
  type RepositorioUsuariosAdmin,
  type UsuarioAdminRegistro,
} from './casos-de-uso.js';
import { inicioMesSP, ultimosMeses } from './meses.js';

describe('meses no fuso de São Paulo', () => {
  it('23h do dia 30 em SP ainda é o mesmo mês (já é dia 1 em UTC)', () => {
    const agora = new Date('2026-12-01T02:00:00Z'); // 30/11 23:00 em SP
    expect(ultimosMeses(agora, 1)).toEqual(['2026-11']);
    expect(inicioMesSP(agora).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(inicioMesSP(agora, 1).toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('6 meses atravessando a virada do ano, do mais antigo ao atual', () => {
    expect(ultimosMeses(new Date('2027-02-15T12:00:00Z'), 6)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(inicioMesSP(new Date('2027-02-15T12:00:00Z'), -5).toISOString()).toBe(
      '2026-09-01T03:00:00.000Z',
    );
  });
});

class PainelFake implements RepositorioPainel {
  periodo: { inicio: Date; fim: Date } | null = null;
  desde: Date | null = null;
  pendencias: Pendencia[] = [];
  contar(p: { inicio: Date; fim: Date }) {
    this.periodo = p;
    return Promise.resolve({
      adocoesPendentes: 3,
      doacoesAnimaisPendentes: 1,
      animaisDisponiveis: 12,
      doacoesMes: { quantidade: 4, totalCentavos: 125_050 },
    });
  }
  adocoesAprovadasPorMes(desde: Date) {
    this.desde = desde;
    return Promise.resolve([
      { mes: '2026-09', total: 2 },
      { mes: '2026-11', total: 5 },
    ]);
  }
  pendenciasRecentes() {
    return Promise.resolve(this.pendencias);
  }
}

class UsuariosFake implements RepositorioUsuariosAdmin {
  lista: UsuarioAdminRegistro[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  adicionar(publicId: string, role: Role, nome = publicId) {
    this.lista.push({
      id: this.lista.length + 1,
      publicId,
      nome,
      email: `${publicId}@teste.org`,
      telefone: '11987654321',
      role,
      ativo: true,
      cidade: 'São Paulo',
      uf: 'SP',
      criadoEm: new Date(Date.UTC(2026, 10, 1, 0, this.lista.length)),
    });
  }
  listar(f: { role?: Role; q?: string }, _c: CursorPainel | undefined, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((u) => !f.role || u.role === f.role)
        .filter((u) => !f.q || u.nome.includes(f.q) || u.email.includes(f.q))
        .slice(0, limite),
    );
  }
  buscar(publicId: string) {
    return Promise.resolve(this.lista.find((u) => u.publicId === publicId) ?? null);
  }
  alterarAtivo(u: UsuarioAdminRegistro, ativo: boolean, a: EntradaAuditoria) {
    this.lista = this.lista.map((x) => (x.id === u.id ? { ...x, ativo } : x));
    this.auditoria.push(a);
    return Promise.resolve();
  }
  alterarRole(u: UsuarioAdminRegistro, role: 'USUARIO' | 'VOLUNTARIO', a: EntradaAuditoria) {
    this.lista = this.lista.map((x) => (x.id === u.id ? { ...x, role } : x));
    this.auditoria.push(a);
    return Promise.resolve();
  }
}

class AuditoriaFake implements RepositorioAuditoria {
  filtro: FiltroAuditoria | null = null;
  listar(f: FiltroAuditoria): Promise<AuditoriaRegistro[]> {
    this.filtro = f;
    return Promise.resolve([
      {
        publicId: 'log-1',
        admin: { publicId: 'admin', nome: 'Karina' },
        acao: 'ADOCAO_APROVADA',
        entidade: 'Adocao',
        entidadeId: 'x',
        detalhe: { animalId: 'a' },
        criadoEm: new Date(),
      },
    ]);
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const MARIA: Ator = { id: 'maria', role: 'USUARIO' };

let painel: PainelFake;
let usuarios: UsuariosFake;
let auditoria: AuditoriaFake;
let encerradas: number[];
let deps: {
  painel: PainelFake;
  usuarios: UsuariosFake;
  auditoria: AuditoriaFake;
  sessoes: { encerrarTodas: (id: number) => Promise<void> };
  relogio: RelogioFake;
};

beforeEach(() => {
  painel = new PainelFake();
  usuarios = new UsuariosFake();
  auditoria = new AuditoriaFake();
  encerradas = [];
  usuarios.adicionar('admin', 'ADMIN', 'Karina Admin');
  usuarios.adicionar('outra-admin', 'ADMIN');
  usuarios.adicionar('maria', 'USUARIO', 'Maria Souza');
  usuarios.adicionar('ana', 'VOLUNTARIO', 'Ana Voluntária');
  deps = {
    painel,
    usuarios,
    auditoria,
    sessoes: {
      encerrarTodas: (id) => {
        encerradas.push(id);
        return Promise.resolve();
      },
    },
    relogio: new RelogioFake(new Date('2026-11-16T15:00:00Z')),
  };
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

describe('dashboard', () => {
  it('cards, gráfico de 6 meses com zeros e total em reais', async () => {
    const d = await new ObterDashboard(deps).executar({ ator: ADMIN });
    expect(d).toMatchObject({
      adocoesPendentes: 3,
      doacoesAnimaisPendentes: 1,
      animaisDisponiveis: 12,
      doacoesFinanceirasMes: { quantidade: 4, total: '1250.50' },
    });
    expect(d.adocoesPorMes).toEqual([
      { mes: '2026-06', total: 0 },
      { mes: '2026-07', total: 0 },
      { mes: '2026-08', total: 0 },
      { mes: '2026-09', total: 2 },
      { mes: '2026-10', total: 0 },
      { mes: '2026-11', total: 5 },
    ]);
    // Mês atual em SP: [01/11 00:00, 01/12 00:00) → em UTC, 03:00.
    expect(painel.periodo?.inicio.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(painel.periodo?.fim.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(painel.desde?.toISOString()).toBe('2026-06-01T03:00:00.000Z');
  });

  it('últimas 5 pendências, mais recentes primeiro, misturando os tipos', async () => {
    painel.pendencias = Array.from({ length: 7 }, (_, i) => ({
      tipo: (['ADOCAO', 'DOACAO_ANIMAL', 'CANDIDATURA_VOLUNTARIO'] as const)[i % 3] ?? 'ADOCAO',
      id: `p${String(i)}`,
      titulo: `Pendência ${String(i)}`,
      criadoEm: new Date(Date.UTC(2026, 10, 1 + i)),
    }));
    const d = await new ObterDashboard(deps).executar({ ator: ADMIN });
    expect(d.ultimasPendencias.map((p) => p.id)).toEqual(['p6', 'p5', 'p4', 'p3', 'p2']);
  });

  it('só ADMIN (voluntário também não)', async () => {
    expect(await codigoDe(new ObterDashboard(deps).executar({ ator: MARIA }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(
      await codigoDe(
        new ObterDashboard(deps).executar({ ator: { id: 'ana', role: 'VOLUNTARIO' } }),
      ),
    ).toBe('ACESSO_NEGADO');
  });
});

describe('gestão de usuários', () => {
  const ativo = (id: string, a: boolean, ator = ADMIN) =>
    new AlterarAtivoUsuario(deps).executar({ ator, id, ativo: a });
  const role = (id: string, r: 'USUARIO' | 'VOLUNTARIO', ator = ADMIN) =>
    new AlterarRoleUsuario(deps).executar({ ator, id, role: r });

  it('lista com filtro por role e busca; sem CPF', async () => {
    const r = await new AdminListarUsuarios(deps).executar({ ator: ADMIN, role: 'USUARIO' });
    expect(r.itens.map((u) => u.nome)).toEqual(['Maria Souza']);
    expect(
      (await new AdminListarUsuarios(deps).executar({ ator: ADMIN, q: '  Ana ' })).itens,
    ).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/cpf|senha/i);
  });

  it('desativar derruba as sessões NA HORA e audita; reativar não', async () => {
    await ativo('maria', false);
    expect(encerradas).toEqual([3]);
    await ativo('maria', false); // sem mudança: nada acontece
    await ativo('maria', true);
    expect(encerradas).toEqual([3]);
    expect(usuarios.auditoria.map((a) => a.acao)).toEqual([
      'USUARIO_DESATIVADO',
      'USUARIO_REATIVADO',
    ]);
  });

  it('promover a voluntário; rebaixar derruba as sessões', async () => {
    await role('maria', 'VOLUNTARIO');
    expect(encerradas).toEqual([]);
    await role('ana', 'USUARIO');
    expect(encerradas).toEqual([4]);
    expect(usuarios.auditoria.map((a) => a.detalhe)).toEqual([
      { de: 'USUARIO', para: 'VOLUNTARIO' },
      { de: 'VOLUNTARIO', para: 'USUARIO' },
    ]);
  });

  it('não altera a própria conta nem outra conta ADMIN', async () => {
    expect(await codigoDe(ativo('admin', false))).toBe('ACAO_NA_PROPRIA_CONTA');
    expect(await codigoDe(ativo('outra-admin', false))).toBe('ALVO_E_ADMIN');
    expect(await codigoDe(role('outra-admin', 'USUARIO'))).toBe('ALVO_E_ADMIN');
    expect(encerradas).toEqual([]);
  });

  it('só ADMIN; inexistente → 404', async () => {
    expect(await codigoDe(ativo('ana', false, MARIA))).toBe('ACESSO_NEGADO');
    expect(await codigoDe(role('maria', 'VOLUNTARIO', { id: 'ana', role: 'VOLUNTARIO' }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(await codigoDe(new AdminListarUsuarios(deps).executar({ ator: MARIA }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(await codigoDe(ativo('fantasma', false))).toBe('USUARIO_NAO_ENCONTRADO');
  });
});

describe('auditoria', () => {
  it('repassa só os filtros informados; só ADMIN', async () => {
    const r = await new ConsultarAuditoria(deps).executar({ ator: ADMIN, entidade: 'Adocao' });
    expect(auditoria.filtro).toEqual({ entidade: 'Adocao' });
    expect(r.itens[0]).toMatchObject({
      id: 'log-1',
      admin: { nome: 'Karina' },
      acao: 'ADOCAO_APROVADA',
    });
    expect(await codigoDe(new ConsultarAuditoria(deps).executar({ ator: MARIA }))).toBe(
      'ACESSO_NEGADO',
    );
  });
});
