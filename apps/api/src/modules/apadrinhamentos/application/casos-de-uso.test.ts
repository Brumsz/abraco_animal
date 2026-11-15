import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';
import {
  AnimaisFake,
  ArmazenamentoFake,
  dadosAnimal,
} from '../../animais/application/testes/fakes.js';
import type { AnimalRegistro } from '../../animais/application/portas.js';
import {
  Apadrinhar,
  EncerrarApadrinhamento,
  ListarMeusApadrinhamentos,
  ListarPadrinhos,
  type ApadrinhamentoRegistro,
  type RepositorioApadrinhamentos,
} from './casos-de-uso.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

class ApadrinhamentosFake implements RepositorioApadrinhamentos {
  readonly lista: (Mutavel<ApadrinhamentoRegistro> & { animalId: number })[] = [];
  readonly nomes = new Map<string, string>();
  private seq = 0;
  constructor(private readonly animais: AnimaisFake) {}

  private montar(a: (typeof this.lista)[number]): ApadrinhamentoRegistro {
    const animal = this.animais.lista.find((x) => x.id === a.animalId);
    if (!animal) throw new Error('animal inexistente');
    return { ...a, animal: { ...animal, fotoCapa: null } };
  }
  apadrinhar(d: { padrinhoId: string; animal: AnimalRegistro; mensagem: string | null }) {
    const existente = this.lista.find(
      (a) => a.padrinhoId === d.padrinhoId && a.animalId === d.animal.id,
    );
    if (existente?.ativo) {
      return Promise.reject(new ErroDominio('CONFLITO', 'JA_PADRINHO', 'já é padrinho'));
    }
    if (existente) {
      Object.assign(existente, { ativo: true, mensagemPadrinho: d.mensagem });
      return Promise.resolve(this.montar(existente));
    }
    this.seq += 1;
    const novo = {
      id: this.seq,
      publicId: randomUUID(),
      padrinhoId: d.padrinhoId,
      ativo: true,
      mensagemPadrinho: d.mensagem,
      criadoEm: new Date(Date.UTC(2026, 10, 1, 0, this.seq)),
      animalId: d.animal.id,
    };
    this.lista.push(novo as (typeof this.lista)[number]);
    return Promise.resolve(this.montar(novo as (typeof this.lista)[number]));
  }
  buscar(publicId: string) {
    const a = this.lista.find((x) => x.publicId === publicId);
    return Promise.resolve(a ? this.montar(a) : null);
  }
  encerrar(a: ApadrinhamentoRegistro) {
    const alvo = this.lista.find((x) => x.id === a.id);
    if (alvo) alvo.ativo = false;
    return Promise.resolve();
  }
  listarDoPadrinho(padrinhoId: string) {
    return Promise.resolve(
      this.lista
        .filter((a) => a.padrinhoId === padrinhoId && a.ativo)
        .sort((x, y) => y.criadoEm.getTime() - x.criadoEm.getTime())
        .map((a) => this.montar(a)),
    );
  }
  listarPadrinhos(animalId: number, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((a) => a.animalId === animalId && a.ativo)
        .slice(0, limite)
        .map((a) => ({
          nome: this.nomes.get(a.padrinhoId ?? '') ?? 'Sem Nome',
          fotoChave: null,
          mensagemPadrinho: a.mensagemPadrinho,
        })),
    );
  }
}

const MARIA: Ator = { id: 'maria', role: 'USUARIO' };
const JOAO: Ator = { id: 'joao', role: 'USUARIO' };

let animais: AnimaisFake;
let repo: ApadrinhamentosFake;
let deps: {
  apadrinhamentos: ApadrinhamentosFake;
  animais: AnimaisFake;
  armazenamento: ArmazenamentoFake;
};

beforeEach(() => {
  animais = new AnimaisFake();
  repo = new ApadrinhamentosFake(animais);
  repo.nomes.set('maria', 'Maria Aparecida Souza');
  deps = { apadrinhamentos: repo, animais, armazenamento: new ArmazenamentoFake() };
});

const animal = (status: 'DISPONIVEL' | 'EM_TRATAMENTO' | 'INDISPONIVEL' = 'DISPONIVEL') =>
  animais.criar({ ...dadosAnimal(), status }, { adminId: 'adm', acao: 'ANIMAL_CRIADO' });

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDominio) return e.codigo;
    throw e;
  }
  return 'SEM_ERRO';
}

const apadrinhar = (ator: Ator, animalId: string, mensagemPadrinho?: string) =>
  new Apadrinhar(deps).executar({
    ator,
    animalId,
    ...(mensagemPadrinho !== undefined ? { mensagemPadrinho } : {}),
  });

describe('apadrinhamentos', () => {
  it('apadrinha um animal DISPONIVEL com mensagem opcional (aparada)', async () => {
    const a = await animal();
    const r = await apadrinhar(MARIA, a.publicId, '  Força, Trovão!  ');
    expect(r).toMatchObject({
      ativo: true,
      mensagemPadrinho: 'Força, Trovão!',
      animal: { id: a.publicId },
    });
    expect((await apadrinhar(JOAO, a.publicId, '   ')).mensagemPadrinho).toBeNull();
  });

  it('D6: animal que não está DISPONIVEL → ANIMAL_NAO_APADRINHAVEL', async () => {
    const a = await animal('EM_TRATAMENTO');
    expect(await codigoDe(apadrinhar(MARIA, a.publicId))).toBe('ANIMAL_NAO_APADRINHAVEL');
  });

  it('animal inexistente → 404; mensagem longa → erro', async () => {
    expect(await codigoDe(apadrinhar(MARIA, randomUUID()))).toBe('ANIMAL_NAO_ENCONTRADO');
    const a = await animal();
    expect(await codigoDe(apadrinhar(MARIA, a.publicId, 'x'.repeat(501)))).toBe('MENSAGEM_LONGA');
  });

  it('já padrinho → conflito; depois de encerrar, pode apadrinhar de novo', async () => {
    const a = await animal();
    const primeiro = await apadrinhar(MARIA, a.publicId);
    expect(await codigoDe(apadrinhar(MARIA, a.publicId))).toBe('JA_PADRINHO');
    await new EncerrarApadrinhamento(deps).executar({ ator: MARIA, id: primeiro.id });
    expect((await apadrinhar(MARIA, a.publicId, 'Voltei!')).mensagemPadrinho).toBe('Voltei!');
  });

  it('só o padrinho encerra (403 para outro usuário); encerrar 2x é idempotente', async () => {
    const a = await animal();
    const { id } = await apadrinhar(MARIA, a.publicId);
    expect(await codigoDe(new EncerrarApadrinhamento(deps).executar({ ator: JOAO, id }))).toBe(
      'ACESSO_NEGADO',
    );
    await new EncerrarApadrinhamento(deps).executar({ ator: MARIA, id });
    await new EncerrarApadrinhamento(deps).executar({ ator: MARIA, id });
    expect(await new ListarMeusApadrinhamentos(deps).executar({ ator: MARIA })).toEqual([]);
    expect(
      await codigoDe(new EncerrarApadrinhamento(deps).executar({ ator: MARIA, id: randomUUID() })),
    ).toBe('APADRINHAMENTO_NAO_ENCONTRADO');
  });

  it('"meus apadrinhamentos" só traz os do usuário', async () => {
    const a = await animal();
    const b = await animal();
    await apadrinhar(MARIA, a.publicId);
    await apadrinhar(MARIA, b.publicId);
    await apadrinhar(JOAO, a.publicId);
    expect(await new ListarMeusApadrinhamentos(deps).executar({ ator: MARIA })).toHaveLength(2);
  });

  it('lista pública mostra só o PRIMEIRO nome e a mensagem', async () => {
    const a = await animal();
    await apadrinhar(MARIA, a.publicId, 'Te amo!');
    const lista = await new ListarPadrinhos(deps).executar({ animalId: a.publicId });
    expect(lista).toEqual([{ nome: 'Maria', fotoUrl: null, mensagemPadrinho: 'Te amo!' }]);
  });

  it('padrinhos de animal INDISPONIVEL: 404 para o público, visível para a equipe', async () => {
    const a = await animal('INDISPONIVEL');
    expect(await codigoDe(new ListarPadrinhos(deps).executar({ animalId: a.publicId }))).toBe(
      'ANIMAL_NAO_ENCONTRADO',
    );
    expect(
      await new ListarPadrinhos(deps).executar({ animalId: a.publicId, role: 'VOLUNTARIO' }),
    ).toEqual([]);
  });
});
