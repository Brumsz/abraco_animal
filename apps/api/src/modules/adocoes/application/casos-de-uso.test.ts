import { beforeEach, describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  AnimaisFake,
  ArmazenamentoFake,
  dadosAnimal,
} from '../../animais/application/testes/fakes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import { MOTIVO_RECUSA_AUTOMATICA } from '../domain/adocao.js';
import {
  AdminListarAdocoes,
  AdminObterAdocao,
  AprovarAdocao,
  ListarMinhasAdocoes,
  ObterAdocao,
  RecusarAdocao,
  SolicitarAdocao,
  type DepsAdocoes,
} from './casos-de-uso.js';
import { AdocoesFake, EmailsAdocaoFake, solicitante } from './testes/fakes.js';

const ADMIN: Ator = { id: '00000000-0000-4000-8000-0000000000ad', role: 'ADMIN' };
const MARIA: Ator = { id: '00000000-0000-4000-8000-00000000000a', role: 'USUARIO' };
const JOAO: Ator = { id: '00000000-0000-4000-8000-00000000000b', role: 'USUARIO' };
const ANA: Ator = { id: '00000000-0000-4000-8000-00000000000c', role: 'VOLUNTARIO' };

let animais: AnimaisFake;
let adocoes: AdocoesFake;
let emails: EmailsAdocaoFake;
let falhasEmail: unknown[];
let deps: DepsAdocoes;

beforeEach(() => {
  animais = new AnimaisFake();
  adocoes = new AdocoesFake(animais);
  emails = new EmailsAdocaoFake();
  falhasEmail = [];
  deps = {
    adocoes,
    animais,
    armazenamento: new ArmazenamentoFake(),
    emails,
    relogio: new RelogioFake(),
    aoFalharEmail: (e) => falhasEmail.push(e),
  };
  adocoes.usuarios.set(MARIA.id, solicitante(MARIA.id, 'Maria Souza'));
  adocoes.usuarios.set(JOAO.id, solicitante(JOAO.id, 'João Lima'));
  adocoes.usuarios.set(ADMIN.id, solicitante(ADMIN.id, 'Karina Admin'));
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

const MOTIVO = 'Tenho um sítio com pasto, baia coberta e experiência com cavalos resgatados.';

const triagem = (extra: Record<string, unknown> = {}) => ({
  tipoMoradia: 'CHACARA' as const,
  possuiEspacoAdequado: true,
  outrosAnimais: '  Dois cães  ',
  motivo: `  ${MOTIVO}  `,
  aceitouTermo: true,
  ...extra,
});

async function animal(status: 'DISPONIVEL' | 'EM_TRATAMENTO' = 'DISPONIVEL') {
  return animais.criar({ ...dadosAnimal(), status }, { adminId: ADMIN.id, acao: 'ANIMAL_CRIADO' });
}

const solicitar = (ator: Ator, animalId: string, extra: Record<string, unknown> = {}) =>
  new SolicitarAdocao(deps).executar({ ator, animalId, triagem: triagem(extra) });

describe('SolicitarAdocao', () => {
  it('cria PENDENTE com a triagem normalizada, termo datado e e-mail de confirmação', async () => {
    const a = await animal();
    const r = await solicitar(MARIA, a.publicId);

    expect(r).toMatchObject({
      status: 'PENDENTE',
      motivo: MOTIVO,
      outrosAnimais: 'Dois cães',
      termoAceitoEm: deps.relogio.agora(),
      animal: { id: a.publicId, nome: 'Trovão' },
    });
    expect(r.timeline).toEqual([
      { etapa: 'ENVIADA', em: r.criadoEm },
      { etapa: 'EM_ANALISE', em: r.criadoEm },
      { etapa: 'APROVADA', em: null },
    ]);
    expect(emails.enviados).toEqual([
      { tipo: 'recebida', para: 'maria@teste.org', nome: 'Maria Souza', animal: 'Trovão' },
    ]);
  });

  it('outrosAnimais em branco vira null', async () => {
    const a = await animal();
    expect((await solicitar(MARIA, a.publicId, { outrosAnimais: '   ' })).outrosAnimais).toBeNull();
  });

  it('termo não aceito → erro, nada criado', async () => {
    const a = await animal();
    expect(await codigoDe(solicitar(MARIA, a.publicId, { aceitouTermo: false }))).toBe(
      'TERMO_NAO_ACEITO',
    );
    expect(adocoes.lista).toHaveLength(0);
  });

  it('motivo com menos de 50 caracteres (sem contar espaços nas pontas) → erro', async () => {
    const a = await animal();
    const curto = `${' '.repeat(30)}${'a'.repeat(49)}${' '.repeat(30)}`;
    expect(await codigoDe(solicitar(MARIA, a.publicId, { motivo: curto }))).toBe('MOTIVO_CURTO');
    expect(await codigoDe(solicitar(MARIA, a.publicId, { motivo: 'a'.repeat(50) }))).toBe(
      'SEM_ERRO',
    );
  });

  it('animal que não está DISPONIVEL → conflito', async () => {
    const a = await animal('EM_TRATAMENTO');
    expect(await codigoDe(solicitar(MARIA, a.publicId))).toBe('ANIMAL_NAO_DISPONIVEL');
  });

  it('animal inexistente ou removido → 404', async () => {
    expect(await codigoDe(solicitar(MARIA, crypto.randomUUID()))).toBe('ANIMAL_NAO_ENCONTRADO');
    const a = await animal();
    await animais.remover(a, new Date(), { adminId: ADMIN.id, acao: 'ANIMAL_REMOVIDO' });
    expect(await codigoDe(solicitar(MARIA, a.publicId))).toBe('ANIMAL_NAO_ENCONTRADO');
  });

  it('segunda solicitação pendente para o mesmo animal → conflito', async () => {
    const a = await animal();
    await solicitar(MARIA, a.publicId);
    expect(await codigoDe(solicitar(MARIA, a.publicId))).toBe('ADOCAO_PENDENTE_EXISTENTE');
    // Outra pessoa pode pedir o mesmo animal.
    expect(await codigoDe(solicitar(JOAO, a.publicId))).toBe('SEM_ERRO');
  });

  it('falha ao enfileirar o e-mail não desfaz a solicitação', async () => {
    const a = await animal();
    emails.falhar = true;
    expect((await solicitar(MARIA, a.publicId)).status).toBe('PENDENTE');
    expect(falhasEmail).toHaveLength(1);
  });
});

describe('IDOR e listagem do usuário', () => {
  it('usuário A não vê a adoção do usuário B (403); dono e admin veem', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);

    expect(await codigoDe(new ObterAdocao(deps).executar({ ator: JOAO, id }))).toBe(
      'ACESSO_NEGADO',
    );
    // Voluntário também não: só o dono ou ADMIN.
    expect(await codigoDe(new ObterAdocao(deps).executar({ ator: ANA, id }))).toBe('ACESSO_NEGADO');
    expect((await new ObterAdocao(deps).executar({ ator: MARIA, id })).id).toBe(id);
    expect((await new ObterAdocao(deps).executar({ ator: ADMIN, id })).id).toBe(id);
  });

  it('adoção inexistente → 404', async () => {
    const p = new ObterAdocao(deps).executar({ ator: MARIA, id: crypto.randomUUID() });
    expect(await codigoDe(p)).toBe('ADOCAO_NAO_ENCONTRADA');
  });

  it('adoção anonimizada (LGPD) não é visível nem ao antigo dono', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    const registro = adocoes.lista[0];
    if (registro) registro.solicitanteId = null;
    expect(await codigoDe(new ObterAdocao(deps).executar({ ator: MARIA, id }))).toBe(
      'ACESSO_NEGADO',
    );
  });

  it('"minhas adoções" traz só as do usuário, mais recentes primeiro, paginadas', async () => {
    const a1 = await animal();
    const a2 = await animal();
    const a3 = await animal();
    const m1 = await solicitar(MARIA, a1.publicId);
    await solicitar(JOAO, a1.publicId);
    const m2 = await solicitar(MARIA, a2.publicId);
    const m3 = await solicitar(MARIA, a3.publicId);

    const listar = new ListarMinhasAdocoes(deps);
    const p1 = await listar.executar({ ator: MARIA, limite: 2 });
    expect(p1.itens.map((x) => x.id)).toEqual([m3.id, m2.id]);
    const p2 = await listar.executar({
      ator: MARIA,
      limite: 2,
      ...(p1.proximoCursor ? { cursor: p1.proximoCursor } : {}),
    });
    expect(p2.itens.map((x) => x.id)).toEqual([m1.id]);
    expect(p2.proximoCursor).toBeNull();
  });
});

describe('admin: listar e detalhar', () => {
  it('só ADMIN (o caso de uso valida a role, não só a rota)', async () => {
    for (const ator of [MARIA, ANA]) {
      expect(await codigoDe(new AdminListarAdocoes(deps).executar({ ator }))).toBe('ACESSO_NEGADO');
      const p = new AdminObterAdocao(deps).executar({ ator, id: crypto.randomUUID() });
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
  });

  it('filtra por status, animal e período', async () => {
    const a1 = await animal();
    const a2 = await animal();
    const x = await solicitar(MARIA, a1.publicId);
    const y = await solicitar(JOAO, a2.publicId);
    await new RecusarAdocao(deps).executar({
      ator: ADMIN,
      id: y.id,
      motivo: 'Espaço insuficiente para o porte.',
    });

    const listar = (f: Record<string, unknown>) =>
      new AdminListarAdocoes(deps)
        .executar({ ator: ADMIN, ...f })
        .then((p) => p.itens.map((i) => i.id));

    expect(await listar({ status: 'PENDENTE' })).toEqual([x.id]);
    expect(await listar({ animalId: a2.publicId })).toEqual([y.id]);
    expect(await listar({ de: y.criadoEm })).toEqual([y.id]);
    expect(await listar({ ate: y.criadoEm })).toEqual([x.id]);
  });

  it('detalhe traz contato e endereço do solicitante, sem CPF', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    const r = await new AdminObterAdocao(deps).executar({ ator: ADMIN, id });

    expect(r.solicitante).toMatchObject({
      id: MARIA.id,
      nome: 'Maria Souza',
      email: 'maria@teste.org',
    });
    expect(JSON.stringify(r)).not.toMatch(/cpf/i);
  });
});

describe('AprovarAdocao', () => {
  it('aprova, adota o animal, encerra as outras pendentes e avisa todo mundo', async () => {
    const a = await animal();
    const maria = await solicitar(MARIA, a.publicId);
    const joao = await solicitar(JOAO, a.publicId);
    emails.enviados.length = 0;

    const r = await new AprovarAdocao(deps).executar({ ator: ADMIN, id: maria.id });

    expect(r).toMatchObject({
      status: 'APROVADA',
      analisadoEm: deps.relogio.agora(),
      analisadoPor: 'Admin',
    });
    expect(r.animal.status).toBe('ADOTADO');
    expect(r.timeline.at(-1)).toEqual({ etapa: 'APROVADA', em: deps.relogio.agora() });

    const encerrada = await new ObterAdocao(deps).executar({ ator: JOAO, id: joao.id });
    expect(encerrada).toMatchObject({
      status: 'RECUSADA',
      recusaAutomatica: true,
      motivoRecusa: MOTIVO_RECUSA_AUTOMATICA,
    });

    expect(adocoes.notificacoes.map((n) => [n.tipo, n.para])).toEqual([
      ['ADOCAO_APROVADA', MARIA.id],
      ['ADOCAO_ANIMAL_ADOTADO', JOAO.id],
    ]);
    expect(emails.enviados.map((e) => [e.tipo, e.para])).toEqual([
      ['aprovada', 'maria@teste.org'],
      ['encerrada', 'joão@teste.org'],
    ]);
    expect(adocoes.auditoria).toEqual([
      {
        adminId: ADMIN.id,
        acao: 'ADOCAO_APROVADA',
        detalhe: { animalId: a.publicId, encerradas: [joao.id] },
      },
    ]);
  });

  it('as notificações não expõem dados pessoais', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    await new AprovarAdocao(deps).executar({ ator: ADMIN, id });
    expect(JSON.stringify(adocoes.notificacoes)).not.toMatch(/maria|@|11987/i);
  });

  it('admin não aprova a própria solicitação', async () => {
    const a = await animal();
    const { id } = await solicitar(ADMIN, a.publicId);
    expect(await codigoDe(new AprovarAdocao(deps).executar({ ator: ADMIN, id }))).toBe(
      'AUTOAPROVACAO_PROIBIDA',
    );
    expect(adocoes.lista[0]?.status).toBe('PENDENTE');
    // Outro admin pode.
    const outroAdmin: Ator = { id: crypto.randomUUID(), role: 'ADMIN' };
    expect((await new AprovarAdocao(deps).executar({ ator: outroAdmin, id })).status).toBe(
      'APROVADA',
    );
  });

  it('adoção já analisada → conflito', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    await new AprovarAdocao(deps).executar({ ator: ADMIN, id });
    expect(await codigoDe(new AprovarAdocao(deps).executar({ ator: ADMIN, id }))).toBe(
      'ADOCAO_JA_ANALISADA',
    );
  });

  it('animal saiu de DISPONIVEL depois do pedido → conflito, nada muda', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    await animais.alterarStatus(a, 'EM_TRATAMENTO', {
      adminId: ADMIN.id,
      acao: 'ANIMAL_STATUS_ALTERADO',
    });

    expect(await codigoDe(new AprovarAdocao(deps).executar({ ator: ADMIN, id }))).toBe(
      'ANIMAL_NAO_DISPONIVEL',
    );
    expect(adocoes.lista[0]?.status).toBe('PENDENTE');
    expect(adocoes.notificacoes).toHaveLength(0);
  });

  it('usuário comum e voluntário → acesso negado', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    for (const ator of [MARIA, ANA]) {
      expect(await codigoDe(new AprovarAdocao(deps).executar({ ator, id }))).toBe('ACESSO_NEGADO');
    }
  });

  it('e-mails que falham não desfazem a aprovação', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    await solicitar(JOAO, a.publicId);
    emails.falhar = true;
    expect((await new AprovarAdocao(deps).executar({ ator: ADMIN, id })).status).toBe('APROVADA');
    expect(falhasEmail).toHaveLength(2);
  });
});

describe('RecusarAdocao', () => {
  it('recusa com motivo, notifica sem o motivo e manda o motivo só por e-mail', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    emails.enviados.length = 0;
    const motivo = '  O espaço informado não comporta um cavalo de grande porte.  ';

    const r = await new RecusarAdocao(deps).executar({ ator: ADMIN, id, motivo });

    expect(r).toMatchObject({
      status: 'RECUSADA',
      motivoRecusa: motivo.trim(),
      recusaAutomatica: false,
    });
    expect(r.timeline.at(-1)).toEqual({ etapa: 'RECUSADA', em: deps.relogio.agora() });
    expect(adocoes.notificacoes).toHaveLength(1);
    expect(adocoes.notificacoes[0]?.corpo).not.toContain('espaço');
    expect(emails.enviados[0]).toMatchObject({ tipo: 'recusada', motivo: motivo.trim() });
    // A auditoria guarda o fato, não o texto livre.
    expect(adocoes.auditoria[0]?.detalhe).toEqual({ animalId: a.publicId });
    // O animal continua disponível.
    expect(animais.lista[0]?.status).toBe('DISPONIVEL');
  });

  it.each(['', 'curto', 'x'.repeat(1001)])('motivo inválido (%#) → erro', async (motivo) => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    expect(await codigoDe(new RecusarAdocao(deps).executar({ ator: ADMIN, id, motivo }))).toBe(
      'MOTIVO_RECUSA_INVALIDO',
    );
  });

  it('já analisada → conflito; não-admin → acesso negado', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    const motivo = 'Motivo suficiente para o teste.';
    expect(await codigoDe(new RecusarAdocao(deps).executar({ ator: MARIA, id, motivo }))).toBe(
      'ACESSO_NEGADO',
    );
    await new RecusarAdocao(deps).executar({ ator: ADMIN, id, motivo });
    expect(await codigoDe(new RecusarAdocao(deps).executar({ ator: ADMIN, id, motivo }))).toBe(
      'ADOCAO_JA_ANALISADA',
    );
  });

  it('depois de recusada, o usuário pode pedir de novo', async () => {
    const a = await animal();
    const { id } = await solicitar(MARIA, a.publicId);
    await new RecusarAdocao(deps).executar({
      ator: ADMIN,
      id,
      motivo: 'Faltou informação na triagem.',
    });
    expect(await codigoDe(solicitar(MARIA, a.publicId))).toBe('SEM_ERRO');
  });
});
