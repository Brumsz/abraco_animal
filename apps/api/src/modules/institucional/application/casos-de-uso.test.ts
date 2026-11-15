import { randomUUID } from 'node:crypto';

import type { SecaoPerfilOng } from '@abraco/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  AdminListarFaq,
  AdminListarSecoes,
  AtualizarFaq,
  CriarFaq,
  EditarSecao,
  ListarFaq,
  ObterPerfilOng,
  RemoverFaq,
  ReordenarFaq,
  type DadosFaq,
  type FaqRegistro,
  type RepositorioInstitucional,
  type SecaoRegistro,
} from './casos-de-uso.js';

class InstitucionalFake implements RepositorioInstitucional {
  secoes: SecaoRegistro[] = [];
  faqs: FaqRegistro[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private seq = 0;

  listarSecoes(p: boolean) {
    return Promise.resolve(this.secoes.filter((s) => !p || s.publicado));
  }
  salvarSecao(
    d: { secao: SecaoPerfilOng; titulo: string; conteudo: string; publicado: boolean },
    a: EntradaAuditoria,
  ) {
    const nova = { ...d, atualizadoEm: new Date() };
    this.secoes = [...this.secoes.filter((s) => s.secao !== d.secao), nova];
    this.auditoria.push(a);
    return Promise.resolve(nova);
  }
  listarFaq(p: boolean) {
    return Promise.resolve(
      this.faqs.filter((f) => !p || f.publicado).sort((a, b) => a.ordem - b.ordem),
    );
  }
  buscarFaq(id: string) {
    return Promise.resolve(this.faqs.find((f) => f.publicId === id) ?? null);
  }
  criarFaq(d: DadosFaq, a: EntradaAuditoria) {
    this.seq += 1;
    const f = {
      ...d,
      id: this.seq,
      publicId: randomUUID(),
      ordem: this.faqs.length,
      atualizadoEm: new Date(),
    };
    this.faqs.push(f);
    this.auditoria.push(a);
    return Promise.resolve(f);
  }
  atualizarFaq(faq: FaqRegistro, d: DadosFaq, a: EntradaAuditoria) {
    const f = { ...faq, ...d };
    this.faqs = this.faqs.map((x) => (x.id === faq.id ? f : x));
    this.auditoria.push(a);
    return Promise.resolve(f);
  }
  removerFaq(faq: FaqRegistro, a: EntradaAuditoria) {
    this.faqs = this.faqs.filter((x) => x.id !== faq.id);
    this.auditoria.push(a);
    return Promise.resolve();
  }
  reordenarFaq(ids: readonly string[], a: EntradaAuditoria) {
    this.faqs = this.faqs.map((f) => ({ ...f, ordem: ids.indexOf(f.publicId) }));
    this.auditoria.push(a);
    return Promise.resolve();
  }
}

const ADMIN: Ator = { id: 'admin', role: 'ADMIN' };
const ANA: Ator = { id: 'ana', role: 'VOLUNTARIO' };

let repo: InstitucionalFake;
let deps: { institucional: InstitucionalFake };

beforeEach(() => {
  repo = new InstitucionalFake();
  deps = { institucional: repo };
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

const editar = (secao: SecaoPerfilOng, publicado = true, ator = ADMIN) =>
  new EditarSecao(deps).executar({
    ator,
    secao,
    titulo: `  Título ${secao} `,
    conteudo: ' Texto. ',
    publicado,
  });

const criar = (pergunta: string, publicado = true) =>
  new CriarFaq(deps).executar({ ator: ADMIN, pergunta, resposta: 'Resposta.', publicado });

describe('perfil da ONG', () => {
  it('público vê só as publicadas, na ordem SOBRE_NOS → FUNDACAO → FUNDADORES', async () => {
    await editar('FUNDADORES');
    await editar('SOBRE_NOS');
    await editar('FUNDACAO', false);
    const r = await new ObterPerfilOng(deps).executar();
    expect(r.map((s) => s.secao)).toEqual(['SOBRE_NOS', 'FUNDADORES']);
    expect(r[0]).toMatchObject({ titulo: 'Título SOBRE_NOS', conteudo: 'Texto.' });
    expect(
      (await new AdminListarSecoes(deps).executar({ ator: ADMIN })).map((s) => s.secao),
    ).toEqual(['SOBRE_NOS', 'FUNDACAO', 'FUNDADORES']);
  });

  it('título/conteúdo vazios ou longos → erro; edição é auditada', async () => {
    const p = new EditarSecao(deps).executar({
      ator: ADMIN,
      secao: 'SOBRE_NOS',
      titulo: ' ',
      conteudo: 'x',
    });
    expect(await codigoDe(p)).toBe('CAMPO_OBRIGATORIO');
    const longo = new EditarSecao(deps).executar({
      ator: ADMIN,
      secao: 'SOBRE_NOS',
      titulo: 'T',
      conteudo: 'x'.repeat(20_001),
    });
    expect(await codigoDe(longo)).toBe('CAMPO_MUITO_LONGO');
    await editar('SOBRE_NOS');
    expect(repo.auditoria).toEqual([
      {
        adminId: 'admin',
        acao: 'PERFIL_ONG_EDITADO',
        detalhe: { secao: 'SOBRE_NOS', publicado: true },
      },
    ]);
  });
});

describe('FAQ', () => {
  it('público vê só as publicadas, em ordem; admin vê todas', async () => {
    await criar('Como adotar?');
    await criar('Rascunho', false);
    await criar('Como doar?');
    expect((await new ListarFaq(deps).executar()).map((f) => f.pergunta)).toEqual([
      'Como adotar?',
      'Como doar?',
    ]);
    expect(await new AdminListarFaq(deps).executar({ ator: ADMIN })).toHaveLength(3);
  });

  it('atualiza, remove e reordena (arrastar e soltar)', async () => {
    const a = await criar('A');
    const b = await criar('B');
    const c = await criar('C');
    await new AtualizarFaq(deps).executar({
      ator: ADMIN,
      id: b.id,
      pergunta: ' B2 ',
      resposta: 'R',
      publicado: true,
    });
    await new ReordenarFaq(deps).executar({ ator: ADMIN, ids: [c.id, a.id, b.id] });
    expect((await new ListarFaq(deps).executar()).map((f) => f.pergunta)).toEqual(['C', 'A', 'B2']);
    await new RemoverFaq(deps).executar({ ator: ADMIN, id: a.id });
    expect((await new ListarFaq(deps).executar()).map((f) => f.pergunta)).toEqual(['C', 'B2']);
    expect(repo.auditoria.map((x) => x.acao)).toEqual([
      'FAQ_CRIADA',
      'FAQ_CRIADA',
      'FAQ_CRIADA',
      'FAQ_ATUALIZADA',
      'FAQ_REORDENADA',
      'FAQ_REMOVIDA',
    ]);
  });

  it('reordenação incompleta ou repetida → erro; pergunta inexistente → 404', async () => {
    const a = await criar('A');
    const b = await criar('B');
    for (const ids of [[a.id], [a.id, a.id], [a.id, randomUUID()]]) {
      expect(await codigoDe(new ReordenarFaq(deps).executar({ ator: ADMIN, ids }))).toBe(
        'REORDENACAO_INVALIDA',
      );
    }
    expect(await codigoDe(new RemoverFaq(deps).executar({ ator: ADMIN, id: randomUUID() }))).toBe(
      'FAQ_NAO_ENCONTRADA',
    );
    const p = new AtualizarFaq(deps).executar({
      ator: ADMIN,
      id: randomUUID(),
      pergunta: 'P',
      resposta: 'R',
    });
    expect(await codigoDe(p)).toBe('FAQ_NAO_ENCONTRADA');
    expect(b.ordem).toBe(1);
  });

  it('só ADMIN edita (voluntário não), validado no caso de uso', async () => {
    const a = await criar('A');
    for (const p of [
      editar('SOBRE_NOS', true, ANA),
      new AdminListarSecoes(deps).executar({ ator: ANA }),
      new AdminListarFaq(deps).executar({ ator: ANA }),
      new CriarFaq(deps).executar({ ator: ANA, pergunta: 'P', resposta: 'R' }),
      new AtualizarFaq(deps).executar({ ator: ANA, id: a.id, pergunta: 'P', resposta: 'R' }),
      new RemoverFaq(deps).executar({ ator: ANA, id: a.id }),
      new ReordenarFaq(deps).executar({ ator: ANA, ids: [a.id] }),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
  });
});
