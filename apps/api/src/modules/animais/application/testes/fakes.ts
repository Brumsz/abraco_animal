/** Implementações em memória das portas do módulo de animais (só testes unitários). */
import { randomUUID } from 'node:crypto';

import type { StatusAnimal } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../../shared/aplicacao/armazenamento.js';
import type { EntradaAuditoria } from '../../../../shared/aplicacao/auditoria.js';
import {
  imagemInvalida,
  type ImagemProcessada,
  type ProcessadorImagens,
} from '../../../../shared/aplicacao/imagens.js';
import { ErroDominio } from '../../../../shared/dominio/erros.js';
import type { DadosAnimal } from '../../domain/animal.js';
import type {
  AnimalCompleto,
  AnimalRegistro,
  CursorAnimais,
  FiltroAnimais,
  FotoRegistro,
  RepositorioAnimais,
} from '../portas.js';

type AnimalMem = { -readonly [K in keyof AnimalCompleto]: AnimalCompleto[K] } & {
  removidoEm: Date | null;
  fotos: FotoRegistro[];
};

export const dadosAnimal = (extra: Partial<DadosAnimal> = {}): DadosAnimal => ({
  nome: 'Trovão',
  tipo: 'EQUINO',
  raca: 'Crioulo',
  idadeAprox: 96,
  sexo: 'MACHO',
  porte: 'GRANDE',
  descricao: 'Dócil e brincalhão.',
  historiaResgate: 'Resgatado de uma carroça na zona sul.',
  vacinado: true,
  castrado: false,
  ...extra,
});

export class AnimaisFake implements RepositorioAnimais {
  readonly lista: AnimalMem[] = [];
  readonly auditoria: (EntradaAuditoria & { entidadeId: string })[] = [];
  /** Força a próxima `adicionarFotos` a falhar (simula erro do banco). */
  falharProximaAdicao = false;
  private seq = 0;
  private relogio = new Date('2026-11-01T12:00:00Z');

  private registrar(animal: AnimalRegistro, a: EntradaAuditoria) {
    this.auditoria.push({ ...a, entidadeId: animal.publicId });
  }
  private obter(animal: AnimalRegistro): AnimalMem {
    const achado = this.lista.find((a) => a.id === animal.id);
    if (!achado) throw new Error('animal inexistente no fake');
    return achado;
  }

  criar(dados: DadosAnimal & { status: StatusAnimal }, a: EntradaAuditoria) {
    this.seq += 1;
    // Cada animal criado 1 min depois do anterior (ordem determinística).
    this.relogio = new Date(this.relogio.getTime() + 60_000);
    const animal: AnimalMem = {
      ...dados,
      id: this.seq,
      publicId: randomUUID(),
      criadoEm: this.relogio,
      fotos: [],
      totalPadrinhos: 0,
      removidoEm: null,
    };
    this.lista.push(animal);
    this.registrar(animal, a);
    return Promise.resolve({ ...animal, fotos: [...animal.fotos] });
  }

  buscar(publicId: string) {
    const a = this.lista.find((x) => x.publicId === publicId && !x.removidoEm);
    return Promise.resolve(a ? { ...a, fotos: [...a.fotos] } : null);
  }

  atualizar(animal: AnimalRegistro, dados: DadosAnimal, a: EntradaAuditoria) {
    Object.assign(this.obter(animal), dados);
    this.registrar(animal, a);
    return Promise.resolve();
  }

  alterarStatus(animal: AnimalRegistro, status: StatusAnimal, a: EntradaAuditoria) {
    this.obter(animal).status = status;
    this.registrar(animal, a);
    return Promise.resolve();
  }

  remover(animal: AnimalRegistro, em: Date, a: EntradaAuditoria) {
    this.obter(animal).removidoEm = em;
    this.registrar(animal, a);
    return Promise.resolve();
  }

  listar(filtro: FiltroAnimais, cursor: CursorAnimais | undefined, limite: number) {
    const depoisDoCursor = (a: AnimalMem) =>
      !cursor ||
      a.criadoEm < cursor.criadoEm ||
      (a.criadoEm.getTime() === cursor.criadoEm.getTime() && a.publicId < cursor.publicId);
    const itens = this.lista
      .filter((a) => !a.removidoEm)
      .filter((a) => !filtro.q || a.nome.toLowerCase().includes(filtro.q.toLowerCase()))
      .filter((a) => !filtro.tipo || a.tipo === filtro.tipo)
      .filter((a) => !filtro.porte || a.porte === filtro.porte)
      .filter((a) => !filtro.sexo || a.sexo === filtro.sexo)
      .filter((a) => !filtro.status || filtro.status.includes(a.status))
      .filter(depoisDoCursor)
      .sort(
        (x, y) =>
          y.criadoEm.getTime() - x.criadoEm.getTime() || y.publicId.localeCompare(x.publicId),
      )
      .slice(0, limite)
      .map((a) => ({ ...a, fotoCapa: a.fotos[0] ?? null }));
    return Promise.resolve(itens);
  }

  adicionarFotos(animal: AnimalRegistro, chaves: readonly string[], a: EntradaAuditoria) {
    if (this.falharProximaAdicao) {
      this.falharProximaAdicao = false;
      return Promise.reject(new ErroDominio('CONFLITO', 'ENVIO_SIMULTANEO', 'conflito'));
    }
    const alvo = this.obter(animal);
    const inicio = (alvo.fotos.at(-1)?.ordem ?? -1) + 1;
    const novas = chaves.map((chave, i) => ({ publicId: randomUUID(), chave, ordem: inicio + i }));
    alvo.fotos.push(...novas);
    this.registrar(animal, a);
    return Promise.resolve(novas);
  }

  removerFoto(animal: AnimalRegistro, foto: FotoRegistro, a: EntradaAuditoria) {
    const alvo = this.obter(animal);
    alvo.fotos = alvo.fotos.filter((f) => f.publicId !== foto.publicId);
    this.registrar(animal, a);
    return Promise.resolve();
  }

  reordenarFotos(animal: AnimalRegistro, ids: readonly string[], a: EntradaAuditoria) {
    const alvo = this.obter(animal);
    alvo.fotos = ids.map((id, ordem) => {
      const foto = alvo.fotos.find((f) => f.publicId === id);
      if (!foto) throw new Error('foto inexistente no fake');
      return { ...foto, ordem };
    });
    this.registrar(animal, a);
    return Promise.resolve();
  }
}

export class ArmazenamentoFake implements ArmazenamentoObjetos {
  readonly objetos = new Map<string, { conteudo: Buffer; tipo: string }>();
  falharEnvioNumero: number | null = null;
  falharRemocao = false;
  private envios = 0;

  enviar(chave: string, conteudo: Buffer, tipoConteudo: string) {
    this.envios += 1;
    if (this.falharEnvioNumero === this.envios) return Promise.reject(new Error('S3 fora do ar'));
    this.objetos.set(chave, { conteudo, tipo: tipoConteudo });
    return Promise.resolve();
  }
  remover(chaves: readonly string[]) {
    if (this.falharRemocao) return Promise.reject(new Error('S3 fora do ar'));
    for (const c of chaves) this.objetos.delete(c);
    return Promise.resolve();
  }
  falharCopiaNumero: number | null = null;
  private copias = 0;
  copiar(origem: string, destino: string) {
    this.copias += 1;
    const obj = this.objetos.get(origem);
    if (!obj || this.falharCopiaNumero === this.copias) {
      return Promise.reject(new Error('falha ao copiar'));
    }
    this.objetos.set(destino, obj);
    return Promise.resolve();
  }
  urlAssinada(chave: string) {
    return Promise.resolve(`https://s3.teste/${chave}?assinatura=x`);
  }
}

/** "Processa" devolvendo os mesmos bytes; recusa o que tiver o marcador CORROMPIDA. */
export class ProcessadorFake implements ProcessadorImagens {
  processados = 0;
  processar(conteudo: Buffer): Promise<ImagemProcessada> {
    this.processados += 1;
    if (conteudo.includes('CORROMPIDA')) return Promise.reject(imagemInvalida());
    return Promise.resolve({ conteudo, tipoConteudo: 'image/webp', extensao: 'webp' });
  }
}

export const JPEG_FALSO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
/** Executável do Windows ("MZ") — com nome .jpg, continua sendo um .exe. */
export const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30)]);
