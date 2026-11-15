/** Repositório de doações de animais em memória (só testes unitários). */
import { randomUUID } from 'node:crypto';

import type { EntradaAuditoria } from '../../../../shared/aplicacao/auditoria.js';
import type { DestinatarioEmail } from '../../../../shared/aplicacao/emails-adocao.js';
import type { EmailsDoacaoAnimal } from '../../../../shared/aplicacao/emails-doacao-animal.js';
import type { ConteudoNotificacao } from '../../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../../shared/dominio/erros.js';
import type { DadosAnimal } from '../../../animais/domain/animal.js';
import type { DadosDoacao } from '../../domain/doacao-animal.js';
import type {
  CursorDoacoes,
  DoacaoDetalhada,
  DoacaoRegistro,
  Doador,
  FiltroDoacoes,
  RepositorioDoacoesAnimais,
} from '../portas.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

export class DoacoesFake implements RepositorioDoacoesAnimais {
  readonly lista: Mutavel<DoacaoDetalhada>[] = [];
  readonly doadores = new Map<string, Doador>();
  readonly animaisCriados: { publicId: string; dados: DadosAnimal; fotos: readonly string[] }[] =
    [];
  readonly notificacoes: (ConteudoNotificacao & { para: string })[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  /** Simula outra admin mudando a doação entre a leitura e a escrita. */
  antesDeReceber: (() => void) | null = null;
  private t = Date.parse('2026-11-01T12:00:00Z');
  private seq = 0;

  criar(d: { doadorId: string; dados: DadosDoacao; chavesFotos: readonly string[] }) {
    this.seq += 1;
    this.t += 60_000;
    const nova: Mutavel<DoacaoDetalhada> = {
      ...d.dados,
      id: this.seq,
      publicId: randomUUID(),
      status: 'PENDENTE',
      doadorId: d.doadorId,
      doador: this.doadores.get(d.doadorId) ?? null,
      fotos: d.chavesFotos.map((chave, ordem) => ({ publicId: randomUUID(), chave, ordem })),
      motivoRecusa: null,
      analisadoEm: null,
      analisadoPor: null,
      recebidoEm: null,
      animalCriadoId: null,
      criadoEm: new Date(this.t),
    };
    this.lista.push(nova);
    return Promise.resolve({ ...nova });
  }

  buscar(publicId: string) {
    const d = this.lista.find((x) => x.publicId === publicId);
    return Promise.resolve(d ? { ...d } : null);
  }

  listar(filtro: FiltroDoacoes, cursor: CursorDoacoes | undefined, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((d) => !filtro.doadorId || d.doadorId === filtro.doadorId)
        .filter((d) => !filtro.status || d.status === filtro.status)
        .filter((d) => !filtro.de || d.criadoEm >= filtro.de)
        .filter((d) => !filtro.ate || d.criadoEm < filtro.ate)
        .filter((d) => !cursor || d.criadoEm < cursor.criadoEm)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite),
    );
  }

  private transicionar(
    doacao: DoacaoRegistro,
    de: readonly string[],
    mudanca: Partial<Mutavel<DoacaoDetalhada>>,
    a: EntradaAuditoria,
    n: ConteudoNotificacao,
  ) {
    const alvo = this.lista.find((x) => x.publicId === doacao.publicId);
    if (!alvo || !de.includes(alvo.status)) {
      return Promise.reject(new ErroDominio('CONFLITO', 'DOACAO_ALTERADA', 'conflito'));
    }
    Object.assign(alvo, mudanca, { analisadoPor: 'Admin' });
    if (alvo.doadorId) this.notificacoes.push({ ...n, para: alvo.doadorId });
    this.auditoria.push(a);
    return Promise.resolve();
  }

  aprovar(
    doacao: DoacaoRegistro,
    d: { em: Date; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ) {
    return this.transicionar(
      doacao,
      ['PENDENTE'],
      { status: 'APROVADA', analisadoEm: d.em },
      d.auditoria,
      d.notificacao,
    );
  }

  recusar(
    doacao: DoacaoRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ) {
    return this.transicionar(
      doacao,
      ['PENDENTE', 'APROVADA'],
      { status: 'RECUSADA', analisadoEm: d.em, motivoRecusa: d.motivo },
      d.auditoria,
      d.notificacao,
    );
  }

  async receber(
    doacao: DoacaoRegistro,
    d: {
      em: Date;
      auditoria: EntradaAuditoria;
      notificacao: ConteudoNotificacao;
      animalPublicId: string;
      animal: DadosAnimal;
      chavesFotosAnimal: readonly string[];
    },
  ) {
    this.antesDeReceber?.();
    await this.transicionar(
      doacao,
      ['APROVADA'],
      { status: 'RECEBIDA', recebidoEm: d.em, animalCriadoId: d.animalPublicId },
      d.auditoria,
      d.notificacao,
    );
    this.animaisCriados.push({
      publicId: d.animalPublicId,
      dados: d.animal,
      fotos: d.chavesFotosAnimal,
    });
  }
}

type Enviado = DestinatarioEmail & { tipo: string; animal: string; motivo?: string };

export class EmailsDoacaoFake implements EmailsDoacaoAnimal {
  readonly enviados: Enviado[] = [];
  falhar = false;
  private registrar(tipo: string, d: DestinatarioEmail & { animal: string; motivo?: string }) {
    if (this.falhar) return Promise.reject(new Error('Redis fora do ar'));
    this.enviados.push({ tipo, ...d });
    return Promise.resolve();
  }
  doacaoEnviada(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('enviada', d);
  }
  doacaoAprovada(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('aprovada', d);
  }
  doacaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    return this.registrar('recusada', d);
  }
  doacaoConcluida(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('concluida', d);
  }
}
