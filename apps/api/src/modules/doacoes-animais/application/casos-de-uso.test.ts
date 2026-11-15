import { beforeEach, describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  ArmazenamentoFake,
  EXE,
  JPEG_FALSO,
  ProcessadorFake,
} from '../../animais/application/testes/fakes.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import { HISTORIA_PADRAO, type DadosDoacao } from '../domain/doacao-animal.js';
import {
  AdminListarDoacoes,
  AdminObterDoacao,
  AprovarDoacao,
  DoarAnimal,
  ListarMinhasDoacoes,
  ObterDoacao,
  ReceberDoacao,
  RecusarDoacao,
  type DepsDoacoes,
} from './casos-de-uso.js';
import { DoacoesFake, EmailsDoacaoFake } from './testes/fakes.js';

const ADMIN: Ator = { id: '00000000-0000-4000-8000-0000000000ad', role: 'ADMIN' };
const MARIA: Ator = { id: '00000000-0000-4000-8000-00000000000a', role: 'USUARIO' };
const JOAO: Ator = { id: '00000000-0000-4000-8000-00000000000b', role: 'USUARIO' };

let doacoes: DoacoesFake;
let armazenamento: ArmazenamentoFake;
let imagens: ProcessadorFake;
let emails: EmailsDoacaoFake;
let deps: DepsDoacoes;

beforeEach(() => {
  doacoes = new DoacoesFake();
  armazenamento = new ArmazenamentoFake();
  imagens = new ProcessadorFake();
  emails = new EmailsDoacaoFake();
  deps = { doacoes, armazenamento, imagens, emails, relogio: new RelogioFake() };
  doacoes.doadores.set(MARIA.id, {
    publicId: MARIA.id,
    nome: 'Maria Souza',
    email: 'maria@teste.org',
    telefone: '11987654321',
  });
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

const dados = (extra: Partial<DadosDoacao> = {}): DadosDoacao => ({
  nomeAnimal: '  Pipoca  ',
  tipo: 'CANINO',
  raca: 'SRD',
  idadeAprox: 24,
  sexo: 'FEMEA',
  porte: 'MEDIO',
  descricao: 'Muito carinhosa e sociável.',
  motivoDoacao: 'Vou me mudar para um apartamento pequeno e não poderei ficar com ela.',
  enderecoRetirada: 'Rua das Flores, 123 — Centro, Campinas/SP',
  ...extra,
});

const doar = (
  ator: Ator = MARIA,
  extra: Partial<DadosDoacao> = {},
  arquivos = [JPEG_FALSO, JPEG_FALSO],
) => new DoarAnimal(deps).executar({ ator, dados: dados(extra), arquivos });

const aprovar = (id: string, ator = ADMIN) => new AprovarDoacao(deps).executar({ ator, id });
const receber = (id: string, ator = ADMIN) => new ReceberDoacao(deps).executar({ ator, id });
const recusar = (id: string, motivo = 'Não temos espaço para cães no momento.', ator = ADMIN) =>
  new RecusarDoacao(deps).executar({ ator, id, motivo });

describe('DoarAnimal', () => {
  it('registra PENDENTE com fotos processadas, dados normalizados e e-mail de confirmação', async () => {
    const r = await doar();

    expect(r).toMatchObject({ status: 'PENDENTE', nomeAnimal: 'Pipoca', animalCriadoId: null });
    expect(r.fotos.map((f) => f.ordem)).toEqual([0, 1]);
    expect(
      [...armazenamento.objetos.keys()].every((k) =>
        /^doacoes-animais\/[0-9a-f-]{36}\.webp$/.test(k),
      ),
    ).toBe(true);
    expect(r.timeline.map((t) => [t.etapa, t.em !== null])).toEqual([
      ['ENVIADA', true],
      ['EM_ANALISE', true],
      ['APROVADA', false],
      ['RECEBIDA', false],
    ]);
    expect(emails.enviados).toEqual([
      { tipo: 'enviada', para: 'maria@teste.org', nome: 'Maria Souza', animal: 'Pipoca' },
    ]);
  });

  it('exige ao menos uma foto e no máximo 10', async () => {
    expect(await codigoDe(doar(MARIA, {}, []))).toBe('FOTO_OBRIGATORIA');
    expect(
      await codigoDe(
        doar(
          MARIA,
          {},
          Array.from({ length: 11 }, () => JPEG_FALSO),
        ),
      ),
    ).toBe('LIMITE_FOTOS');
  });

  it('arquivo .exe disfarçado → recusa tudo, nada no bucket nem no banco', async () => {
    expect(await codigoDe(doar(MARIA, {}, [JPEG_FALSO, EXE]))).toBe('IMAGEM_INVALIDA');
    expect(armazenamento.objetos.size).toBe(0);
    expect(doacoes.lista).toHaveLength(0);
  });

  it('valida os dados do animal com as regras do cadastro (campo com o nome do formulário)', async () => {
    const erro = await doar(MARIA, { nomeAnimal: '   ' }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ codigo: 'CAMPO_OBRIGATORIO', campo: 'nomeAnimal' });
    expect(await codigoDe(doar(MARIA, { idadeAprox: 999 }))).toBe('IDADE_INVALIDA');
  });

  it('motivo e endereço curtos demais → erro', async () => {
    expect(await codigoDe(doar(MARIA, { motivoDoacao: 'não quero' }))).toBe('CAMPO_CURTO');
    expect(await codigoDe(doar(MARIA, { enderecoRetirada: 'Rua A' }))).toBe('CAMPO_CURTO');
  });

  it('falha no banco apaga do bucket as fotos já enviadas', async () => {
    doacoes.criar = () => Promise.reject(new Error('banco fora do ar'));
    await expect(doar()).rejects.toThrow('banco fora do ar');
    expect(armazenamento.objetos.size).toBe(0);
  });

  it('falha ao enfileirar o e-mail não desfaz a doação', async () => {
    const falhas: unknown[] = [];
    deps = { ...deps, aoFalharEmail: (e) => falhas.push(e) };
    emails.falhar = true;
    expect((await doar()).status).toBe('PENDENTE');
    expect(falhas).toHaveLength(1);
  });
});

describe('acesso do doador', () => {
  it('IDOR: outro usuário → 403; dono e admin veem', async () => {
    const { id } = await doar();
    expect(await codigoDe(new ObterDoacao(deps).executar({ ator: JOAO, id }))).toBe(
      'ACESSO_NEGADO',
    );
    expect((await new ObterDoacao(deps).executar({ ator: MARIA, id })).id).toBe(id);
    expect((await new ObterDoacao(deps).executar({ ator: ADMIN, id })).id).toBe(id);
  });

  it('"minhas doações" traz só as do usuário', async () => {
    await doar(MARIA);
    await doar(JOAO);
    const p = await new ListarMinhasDoacoes(deps).executar({ ator: MARIA });
    expect(p.itens).toHaveLength(1);
  });

  it('doação inexistente → 404', async () => {
    const p = new ObterDoacao(deps).executar({ ator: MARIA, id: crypto.randomUUID() });
    expect(await codigoDe(p)).toBe('DOACAO_NAO_ENCONTRADA');
  });
});

describe('análise pelo admin', () => {
  it('só ADMIN executa os casos de uso de admin', async () => {
    const { id } = await doar();
    for (const p of [
      new AdminListarDoacoes(deps).executar({ ator: MARIA }),
      new AdminObterDoacao(deps).executar({ ator: MARIA, id }),
      aprovar(id, MARIA),
      recusar(id, 'Motivo qualquer suficiente.', MARIA),
      receber(id, MARIA),
    ]) {
      expect(await codigoDe(p)).toBe('ACESSO_NEGADO');
    }
    expect(doacoes.lista[0]?.status).toBe('PENDENTE');
  });

  it('detalhe do admin traz o contato do doador', async () => {
    const { id } = await doar();
    const r = await new AdminObterDoacao(deps).executar({ ator: ADMIN, id });
    expect(r.doador).toEqual({
      id: MARIA.id,
      nome: 'Maria Souza',
      email: 'maria@teste.org',
      telefone: '11987654321',
    });
  });

  it('aprovar: notifica, manda e-mail e audita', async () => {
    const { id } = await doar();
    emails.enviados.length = 0;
    const r = await aprovar(id);
    expect(r.status).toBe('APROVADA');
    expect(doacoes.notificacoes.map((n) => n.titulo)).toEqual(['Sua doação foi aceita 💛']);
    expect(emails.enviados.map((e) => e.tipo)).toEqual(['aprovada']);
    expect(doacoes.auditoria.map((a) => a.acao)).toEqual(['DOACAO_ANIMAL_APROVADA']);
  });

  it('aprovar duas vezes → conflito', async () => {
    const { id } = await doar();
    await aprovar(id);
    expect(await codigoDe(aprovar(id))).toBe('TRANSICAO_DOACAO_INVALIDA');
  });

  it('recusar vale para PENDENTE e para APROVADA (retirada que não deu certo)', async () => {
    const a = await doar();
    const b = await doar();
    await aprovar(b.id);
    expect((await recusar(a.id)).status).toBe('RECUSADA');
    const r = await recusar(b.id);
    expect(r).toMatchObject({
      status: 'RECUSADA',
      motivoRecusa: 'Não temos espaço para cães no momento.',
    });
    expect(doacoes.auditoria.at(-1)?.detalhe).toEqual({ statusAnterior: 'APROVADA' });
    // A notificação não leva o motivo.
    expect(doacoes.notificacoes.at(-1)?.corpo).not.toContain('espaço');
  });

  it('recusar sem motivo suficiente → erro; recusar recebida → conflito', async () => {
    const { id } = await doar();
    expect(await codigoDe(recusar(id, 'curto'))).toBe('MOTIVO_RECUSA_INVALIDO');
    await aprovar(id);
    await receber(id);
    expect(await codigoDe(recusar(id))).toBe('TRANSICAO_DOACAO_INVALIDA');
  });

  it('filtros por status e período', async () => {
    const a = await doar();
    const b = await doar();
    await aprovar(b.id);
    const ids = (f: Record<string, unknown>) =>
      new AdminListarDoacoes(deps)
        .executar({ ator: ADMIN, ...f })
        .then((p) => p.itens.map((i) => i.id));
    expect(await ids({ status: 'PENDENTE' })).toEqual([a.id]);
    expect(await ids({ de: b.criadoEm })).toEqual([b.id]);
    expect(await ids({ ate: b.criadoEm })).toEqual([a.id]);
  });
});

describe('ReceberDoacao', () => {
  it('cria o animal EM_TRATAMENTO com cópias das fotos, sem expor o motivo do doador', async () => {
    const { id } = await doar();
    await aprovar(id);
    const r = await receber(id);

    expect(r.status).toBe('RECEBIDA');
    expect(r.recebidoEm).toEqual(deps.relogio.agora());
    expect(r.timeline.at(-1)).toEqual({ etapa: 'RECEBIDA', em: deps.relogio.agora() });

    const [animal] = doacoes.animaisCriados;
    expect(r.animalCriadoId).toBe(animal?.publicId);
    expect(animal?.dados).toMatchObject({
      nome: 'Pipoca',
      tipo: 'CANINO',
      historiaResgate: HISTORIA_PADRAO,
      vacinado: false,
      castrado: false,
    });
    expect(JSON.stringify(animal?.dados)).not.toContain('apartamento');

    // Fotos do animal são CÓPIAS em animais/{id}/: as da doação continuam no bucket.
    expect(animal?.fotos).toHaveLength(2);
    for (const chave of animal?.fotos ?? []) {
      expect(chave.startsWith(`animais/${animal?.publicId ?? ''}/`)).toBe(true);
      expect(armazenamento.objetos.has(chave)).toBe(true);
    }
    expect(armazenamento.objetos.size).toBe(4);
    expect(doacoes.notificacoes.at(-1)?.titulo).toBe('Pipoca chegou à ONG!');
    expect(emails.enviados.at(-1)?.tipo).toBe('concluida');
  });

  it('idempotente: receber de novo não cria outro animal', async () => {
    const { id } = await doar();
    await aprovar(id);
    const primeira = await receber(id);
    const segunda = await receber(id);
    expect(segunda.animalCriadoId).toBe(primeira.animalCriadoId);
    expect(doacoes.animaisCriados).toHaveLength(1);
    expect(armazenamento.objetos.size).toBe(4);
  });

  it('corrida: outra admin recebeu no meio do caminho → devolve o resultado dela e limpa as cópias', async () => {
    const { id } = await doar();
    await aprovar(id);
    doacoes.antesDeReceber = () => {
      const alvo = doacoes.lista[0];
      if (alvo)
        Object.assign(alvo, { status: 'RECEBIDA', animalCriadoId: 'animal-da-outra-admin' });
    };
    const r = await receber(id);
    expect(r.animalCriadoId).toBe('animal-da-outra-admin');
    expect(armazenamento.objetos.size).toBe(2);
  });

  it('pendente ou recusada → conflito (é preciso aprovar antes)', async () => {
    const { id } = await doar();
    expect(await codigoDe(receber(id))).toBe('TRANSICAO_DOACAO_INVALIDA');
    await recusar(id);
    expect(await codigoDe(receber(id))).toBe('TRANSICAO_DOACAO_INVALIDA');
  });

  it('falha ao copiar uma foto → nada é criado e as cópias feitas são apagadas', async () => {
    const { id } = await doar();
    await aprovar(id);
    armazenamento.falharCopiaNumero = 2;
    await expect(receber(id)).rejects.toThrow('falha ao copiar');
    expect(doacoes.lista[0]?.status).toBe('APROVADA');
    expect(doacoes.animaisCriados).toHaveLength(0);
    expect(armazenamento.objetos.size).toBe(2);
  });
});
