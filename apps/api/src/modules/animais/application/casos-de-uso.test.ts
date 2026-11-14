import { beforeEach, describe, expect, it } from 'vitest';

import { prepararImagens } from '../../../shared/aplicacao/imagens.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { RelogioFake } from '../../auth/application/testes/fakes.js';
import { ListarAnimais, ObterAnimal } from './consultar-animais.js';
import { EnviarFotosAnimal, RemoverFotoAnimal, ReordenarFotosAnimal } from './fotos-animal.js';
import {
  AlterarStatusAnimal,
  AtualizarAnimal,
  CriarAnimal,
  RemoverAnimal,
} from './gerenciar-animais.js';
import {
  AnimaisFake,
  ArmazenamentoFake,
  dadosAnimal,
  EXE,
  JPEG_FALSO,
  ProcessadorFake,
} from './testes/fakes.js';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', role: 'ADMIN' as const };
const USUARIO = { id: '00000000-0000-4000-8000-000000000002', role: 'USUARIO' as const };

let animais: AnimaisFake;
let armazenamento: ArmazenamentoFake;
let imagens: ProcessadorFake;
let deps: {
  animais: AnimaisFake;
  armazenamento: ArmazenamentoFake;
  imagens: ProcessadorFake;
  relogio: RelogioFake;
};

beforeEach(() => {
  animais = new AnimaisFake();
  armazenamento = new ArmazenamentoFake();
  imagens = new ProcessadorFake();
  deps = { animais, armazenamento, imagens, relogio: new RelogioFake() };
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

const criar = (extra: Parameters<typeof dadosAnimal>[0] = {}, status?: 'EM_TRATAMENTO') =>
  new CriarAnimal(deps).executar({
    ator: ADMIN,
    dados: dadosAnimal(extra),
    ...(status ? { status } : {}),
  });

const enviar = (id: string, arquivos: Buffer[]) =>
  new EnviarFotosAnimal(deps).executar({ ator: ADMIN, id, arquivos });

describe('CriarAnimal', () => {
  it('cria DISPONIVEL por padrão, normaliza os dados e audita', async () => {
    const animal = await criar({ nome: '  Estrela  ' });

    expect(animal).toMatchObject({
      nome: 'Estrela',
      status: 'DISPONIVEL',
      fotos: [],
      fotoCapa: null,
    });
    expect(animais.auditoria).toEqual([
      {
        adminId: ADMIN.id,
        acao: 'ANIMAL_CRIADO',
        entidadeId: animal.id,
        detalhe: { status: 'DISPONIVEL' },
      },
    ]);
  });

  it('recusa cadastrar como ADOTADO', async () => {
    const p = new CriarAnimal(deps).executar({
      ator: ADMIN,
      dados: dadosAnimal(),
      status: 'ADOTADO',
    });
    expect(await codigoDe(p)).toBe('STATUS_INICIAL_INVALIDO');
    expect(animais.lista).toHaveLength(0);
  });
});

describe('AtualizarAnimal', () => {
  it('audita só os nomes dos campos alterados', async () => {
    const { id } = await criar();
    const r = await new AtualizarAnimal(deps).executar({
      ator: ADMIN,
      id,
      dados: dadosAnimal({ nome: 'Trovão Azul', castrado: true }),
    });

    expect(r).toMatchObject({ nome: 'Trovão Azul', castrado: true });
    expect(animais.auditoria.at(-1)).toMatchObject({
      acao: 'ANIMAL_ATUALIZADO',
      detalhe: { campos: ['nome', 'castrado'] },
    });
  });

  it('sem mudanças não escreve nem audita', async () => {
    const { id } = await criar();
    await new AtualizarAnimal(deps).executar({ ator: ADMIN, id, dados: dadosAnimal() });
    expect(animais.auditoria).toHaveLength(1);
  });

  it('animal inexistente → 404', async () => {
    const p = new AtualizarAnimal(deps).executar({
      ator: ADMIN,
      id: crypto.randomUUID(),
      dados: dadosAnimal(),
    });
    expect(await codigoDe(p)).toBe('ANIMAL_NAO_ENCONTRADO');
  });
});

describe('AlterarStatusAnimal', () => {
  it('altera e audita de/para', async () => {
    const { id } = await criar();
    const r = await new AlterarStatusAnimal(deps).executar({
      ator: ADMIN,
      id,
      status: 'EM_TRATAMENTO',
    });

    expect(r.status).toBe('EM_TRATAMENTO');
    expect(animais.auditoria.at(-1)).toMatchObject({
      acao: 'ANIMAL_STATUS_ALTERADO',
      detalhe: { de: 'DISPONIVEL', para: 'EM_TRATAMENTO' },
    });
  });

  it('ADOTADO manual → conflito, sem escrita', async () => {
    const { id } = await criar();
    const p = new AlterarStatusAnimal(deps).executar({ ator: ADMIN, id, status: 'ADOTADO' });
    expect(await codigoDe(p)).toBe('TRANSICAO_STATUS_INVALIDA');
    expect(animais.lista[0]?.status).toBe('DISPONIVEL');
  });

  it('mesmo status não gera auditoria', async () => {
    const { id } = await criar();
    await new AlterarStatusAnimal(deps).executar({ ator: ADMIN, id, status: 'DISPONIVEL' });
    expect(animais.auditoria).toHaveLength(1);
  });
});

describe('RemoverAnimal (soft delete)', () => {
  it('some das consultas, mas preserva as fotos no bucket', async () => {
    const { id } = await criar();
    await enviar(id, [JPEG_FALSO]);
    await new RemoverAnimal(deps).executar({ ator: ADMIN, id });

    expect(await codigoDe(new ObterAnimal(deps).executar({ id, role: 'ADMIN' }))).toBe(
      'ANIMAL_NAO_ENCONTRADO',
    );
    expect((await new ListarAnimais(deps).executar({ role: 'ADMIN' })).itens).toHaveLength(0);
    expect(armazenamento.objetos.size).toBe(1);
    expect(animais.lista[0]?.removidoEm).toEqual(deps.relogio.agora());
    // Remover de novo → 404 (não audita duas vezes).
    expect(await codigoDe(new RemoverAnimal(deps).executar({ ator: ADMIN, id }))).toBe(
      'ANIMAL_NAO_ENCONTRADO',
    );
  });
});

describe('ListarAnimais', () => {
  it('público vê só DISPONIVEL, mesmo pedindo outro status', async () => {
    await criar({ nome: 'Disponível' });
    await criar({ nome: 'Tratamento' }, 'EM_TRATAMENTO');

    const anonimo = await new ListarAnimais(deps).executar({ status: 'EM_TRATAMENTO' });
    expect(anonimo.itens.map((a) => a.nome)).toEqual(['Disponível']);

    const usuario = await new ListarAnimais(deps).executar({ role: 'USUARIO' });
    expect(usuario.itens.map((a) => a.nome)).toEqual(['Disponível']);
  });

  it('equipe vê todos ou filtra por status', async () => {
    await criar({ nome: 'A' });
    await criar({ nome: 'B' }, 'EM_TRATAMENTO');

    expect((await new ListarAnimais(deps).executar({ role: 'ADMIN' })).itens).toHaveLength(2);
    const filtrado = await new ListarAnimais(deps).executar({
      role: 'VOLUNTARIO',
      status: 'EM_TRATAMENTO',
    });
    expect(filtrado.itens.map((a) => a.nome)).toEqual(['B']);
  });

  it('pagina por cursor sem repetir nem pular itens (mais novo primeiro)', async () => {
    for (let i = 1; i <= 5; i++) await criar({ nome: `Animal ${String(i)}` });
    const listar = new ListarAnimais(deps);

    const p1 = await listar.executar({ limite: 2 });
    const p2 = await listar.executar({
      limite: 2,
      ...(p1.proximoCursor ? { cursor: p1.proximoCursor } : {}),
    });
    const p3 = await listar.executar({
      limite: 2,
      ...(p2.proximoCursor ? { cursor: p2.proximoCursor } : {}),
    });

    expect([...p1.itens, ...p2.itens, ...p3.itens].map((a) => a.nome)).toEqual([
      'Animal 5',
      'Animal 4',
      'Animal 3',
      'Animal 2',
      'Animal 1',
    ]);
    expect(p3.proximoCursor).toBeNull();
  });

  it('última página exata não aponta para página vazia', async () => {
    await criar();
    await criar();
    expect((await new ListarAnimais(deps).executar({ limite: 2 })).proximoCursor).toBeNull();
  });

  it('limite é forçado entre 1 e 50', async () => {
    for (let i = 0; i < 3; i++) await criar();
    expect((await new ListarAnimais(deps).executar({ limite: 0 })).itens).toHaveLength(1);
    expect((await new ListarAnimais(deps).executar({ limite: 999 })).itens).toHaveLength(3);
  });

  it('filtra por nome (sem diferenciar maiúsculas), tipo, porte e sexo', async () => {
    await criar({ nome: 'Trovão', tipo: 'EQUINO', porte: 'GRANDE', sexo: 'MACHO' });
    await criar({ nome: 'Pipoca', tipo: 'CANINO', porte: 'PEQUENO', sexo: 'FEMEA' });
    const listar = new ListarAnimais(deps);
    const nomes = async (e: Parameters<ListarAnimais['executar']>[0]) =>
      (await listar.executar(e)).itens.map((a) => a.nome);

    expect(await nomes({ q: '  troV ' })).toEqual(['Trovão']);
    expect(await nomes({ tipo: 'CANINO' })).toEqual(['Pipoca']);
    expect(await nomes({ porte: 'GRANDE' })).toEqual(['Trovão']);
    expect(await nomes({ sexo: 'FEMEA' })).toEqual(['Pipoca']);
    expect(await nomes({ q: '   ' })).toHaveLength(2);
  });

  it('a capa é a primeira foto, com URL assinada', async () => {
    const { id } = await criar();
    await enviar(id, [JPEG_FALSO, JPEG_FALSO]);

    const [item] = (await new ListarAnimais(deps).executar({})).itens;
    expect(item?.fotoCapa?.ordem).toBe(0);
    expect(item?.fotoCapa?.url).toMatch(/^https:\/\/s3\.teste\/animais\/.+\.webp\?assinatura=x$/);
  });
});

describe('ObterAnimal', () => {
  it('INDISPONIVEL: 404 para o público, visível para a equipe', async () => {
    const { id } = await criar();
    await new AlterarStatusAnimal(deps).executar({ ator: ADMIN, id, status: 'INDISPONIVEL' });

    expect(await codigoDe(new ObterAnimal(deps).executar({ id }))).toBe('ANIMAL_NAO_ENCONTRADO');
    expect(await codigoDe(new ObterAnimal(deps).executar({ id, role: 'USUARIO' }))).toBe(
      'ANIMAL_NAO_ENCONTRADO',
    );
    expect((await new ObterAnimal(deps).executar({ id, role: 'VOLUNTARIO' })).status).toBe(
      'INDISPONIVEL',
    );
  });

  it('EM_TRATAMENTO aparece no detalhe para o público', async () => {
    const { id } = await criar({}, 'EM_TRATAMENTO');
    expect((await new ObterAnimal(deps).executar({ id })).status).toBe('EM_TRATAMENTO');
  });
});

describe('EnviarFotosAnimal', () => {
  it('envia ao bucket com chave aleatória e acrescenta ao fim da galeria', async () => {
    const { id } = await criar();
    await enviar(id, [JPEG_FALSO]);
    const fotos = await enviar(id, [JPEG_FALSO, JPEG_FALSO]);

    expect(fotos.map((f) => f.ordem)).toEqual([1, 2]);
    expect([...armazenamento.objetos.keys()]).toHaveLength(3);
    for (const chave of armazenamento.objetos.keys()) {
      expect(chave).toMatch(new RegExp(`^animais/${id}/[0-9a-f-]{36}\\.webp$`));
    }
    expect(animais.auditoria.at(-1)).toMatchObject({
      acao: 'ANIMAL_FOTOS_ADICIONADAS',
      detalhe: { quantidade: 2 },
    });
  });

  it('extensão .jpg com bytes de .exe → recusa o envio inteiro sem processar nada', async () => {
    const { id } = await criar();
    expect(await codigoDe(enviar(id, [JPEG_FALSO, EXE]))).toBe('IMAGEM_INVALIDA');
    expect(imagens.processados).toBe(0);
    expect(armazenamento.objetos.size).toBe(0);
  });

  it('bytes iniciais certos mas conteúdo corrompido → IMAGEM_INVALIDA', async () => {
    const { id } = await criar();
    const corrompida = Buffer.concat([JPEG_FALSO, Buffer.from('CORROMPIDA')]);
    expect(await codigoDe(enviar(id, [corrompida]))).toBe('IMAGEM_INVALIDA');
    expect(armazenamento.objetos.size).toBe(0);
  });

  it('respeita o máximo de 10 fotos por animal no total', async () => {
    const { id } = await criar();
    await enviar(
      id,
      Array.from({ length: 8 }, () => JPEG_FALSO),
    );
    expect(await codigoDe(enviar(id, [JPEG_FALSO, JPEG_FALSO, JPEG_FALSO]))).toBe('LIMITE_FOTOS');
    expect(await codigoDe(enviar(id, [JPEG_FALSO, JPEG_FALSO]))).toBe('SEM_ERRO');
  });

  it('nenhum arquivo → erro de validação', async () => {
    const { id } = await criar();
    expect(await codigoDe(enviar(id, []))).toBe('NENHUM_ARQUIVO');
  });

  it('falha no banco apaga do bucket o que já tinha subido (compensação)', async () => {
    const { id } = await criar();
    animais.falharProximaAdicao = true;
    expect(await codigoDe(enviar(id, [JPEG_FALSO, JPEG_FALSO]))).toBe('ENVIO_SIMULTANEO');
    expect(armazenamento.objetos.size).toBe(0);
  });

  it('falha no meio do envio ao S3 também não deixa sobras', async () => {
    const { id } = await criar();
    armazenamento.falharEnvioNumero = 2;
    await expect(enviar(id, [JPEG_FALSO, JPEG_FALSO, JPEG_FALSO])).rejects.toThrow('S3 fora do ar');
    expect(armazenamento.objetos.size).toBe(0);
    expect(animais.lista[0]?.fotos).toHaveLength(0);
  });

  it('a compensação que falha não esconde o erro original', async () => {
    const { id } = await criar();
    animais.falharProximaAdicao = true;
    armazenamento.falharRemocao = true;
    expect(await codigoDe(enviar(id, [JPEG_FALSO]))).toBe('ENVIO_SIMULTANEO');
  });
});

describe('RemoverFotoAnimal e ReordenarFotosAnimal', () => {
  async function animalCom3Fotos() {
    const { id } = await criar();
    const fotos = await enviar(id, [JPEG_FALSO, JPEG_FALSO, JPEG_FALSO]);
    return { id, ids: fotos.map((f) => f.id) };
  }

  it('remove do banco e do bucket', async () => {
    const { id, ids } = await animalCom3Fotos();
    await new RemoverFotoAnimal(deps).executar({ ator: ADMIN, id, fotoId: ids[1] ?? '' });

    const detalhe = await new ObterAnimal(deps).executar({ id });
    expect(detalhe.fotos.map((f) => f.id)).toEqual([ids[0], ids[2]]);
    expect(armazenamento.objetos.size).toBe(2);
  });

  it('remoção conclui mesmo se o bucket falhar (fica órfão, invisível)', async () => {
    const { id, ids } = await animalCom3Fotos();
    armazenamento.falharRemocao = true;
    await new RemoverFotoAnimal(deps).executar({ ator: ADMIN, id, fotoId: ids[0] ?? '' });
    expect((await new ObterAnimal(deps).executar({ id })).fotos).toHaveLength(2);
  });

  it('foto de outro animal → 404', async () => {
    const a = await animalCom3Fotos();
    const b = await animalCom3Fotos();
    const p = new RemoverFotoAnimal(deps).executar({
      ator: ADMIN,
      id: a.id,
      fotoId: b.ids[0] ?? '',
    });
    expect(await codigoDe(p)).toBe('FOTO_NAO_ENCONTRADA');
  });

  it('reordena e a capa passa a ser a nova primeira', async () => {
    const { id, ids } = await animalCom3Fotos();
    const nova = [ids[2] ?? '', ids[0] ?? '', ids[1] ?? ''];
    await new ReordenarFotosAnimal(deps).executar({ ator: ADMIN, id, ids: nova });

    const detalhe = await new ObterAnimal(deps).executar({ id });
    expect(detalhe.fotos.map((f) => f.id)).toEqual(nova);
    expect(detalhe.fotoCapa?.id).toBe(ids[2]);
  });

  it.each([
    ['faltando uma', (ids: string[]) => ids.slice(0, 2)],
    ['repetida', (ids: string[]) => [ids[0] ?? '', ids[0] ?? '', ids[1] ?? '']],
    ['de outro animal', (ids: string[]) => [ids[0] ?? '', ids[1] ?? '', crypto.randomUUID()]],
  ])('reordenação inválida (%s) → erro de validação', async (_nome, montar) => {
    const { id, ids } = await animalCom3Fotos();
    const p = new ReordenarFotosAnimal(deps).executar({ ator: ADMIN, id, ids: montar(ids) });
    expect(await codigoDe(p)).toBe('REORDENACAO_INVALIDA');
  });
});

describe('prepararImagens', () => {
  it('processa em ordem e devolve uma imagem por arquivo', async () => {
    const r = await prepararImagens([JPEG_FALSO, JPEG_FALSO], imagens);
    expect(r).toHaveLength(2);
    expect(imagens.processados).toBe(2);
  });
});

describe('permissão validada no caso de uso (seção 5), não só na rota', () => {
  it('USUARIO e VOLUNTARIO não executam nenhum caso de uso de admin', async () => {
    const { id } = await criar();
    const fotos = await enviar(id, [JPEG_FALSO]);
    const fotoId = fotos[0]?.id ?? '';
    for (const ator of [USUARIO, { ...USUARIO, role: 'VOLUNTARIO' as const }]) {
      const chamadas = [
        new CriarAnimal(deps).executar({ ator, dados: dadosAnimal() }),
        new AtualizarAnimal(deps).executar({ ator, id, dados: dadosAnimal({ nome: 'X' }) }),
        new AlterarStatusAnimal(deps).executar({ ator, id, status: 'INDISPONIVEL' }),
        new RemoverAnimal(deps).executar({ ator, id }),
        new EnviarFotosAnimal(deps).executar({ ator, id, arquivos: [JPEG_FALSO] }),
        new RemoverFotoAnimal(deps).executar({ ator, id, fotoId }),
        new ReordenarFotosAnimal(deps).executar({ ator, id, ids: [fotoId] }),
      ];
      for (const chamada of chamadas) expect(await codigoDe(chamada)).toBe('ACESSO_NEGADO');
    }
    // Nada mudou: só as duas escritas do admin estão na auditoria.
    expect(animais.auditoria).toHaveLength(2);
    expect(animais.lista[0]).toMatchObject({
      nome: 'Trovão',
      status: 'DISPONIVEL',
      removidoEm: null,
    });
  });
});
