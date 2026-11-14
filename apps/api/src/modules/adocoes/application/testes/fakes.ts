/** Repositório de adoções em memória, ligado ao fake de animais (só testes unitários). */
import { randomUUID } from 'node:crypto';

import type { EntradaAuditoria } from '../../../../shared/aplicacao/auditoria.js';
import type {
  DestinatarioEmail,
  EmailsAdocao,
} from '../../../../shared/aplicacao/emails-adocao.js';
import type { ConteudoNotificacao } from '../../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../../shared/dominio/erros.js';
import type { AnimaisFake } from '../../../animais/application/testes/fakes.js';
import type { AnimalRegistro } from '../../../animais/application/portas.js';
import type { Triagem } from '../../domain/adocao.js';
import type {
  AdocaoDetalhada,
  AdocaoRegistro,
  CursorAdocoes,
  Encerrada,
  FiltroAdocoes,
  RepositorioAdocoes,
  Solicitante,
} from '../portas.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

interface AdocaoMem extends Mutavel<Omit<AdocaoDetalhada, 'animal'>> {
  animalId: string;
}

export const solicitante = (publicId: string, nome = 'Maria Souza'): Solicitante => ({
  publicId,
  nome,
  email: `${nome.split(' ')[0]?.toLowerCase() ?? 'x'}@teste.org`,
  telefone: '11987654321',
  endereco: {
    cep: '01001000',
    logradouro: 'Praça da Sé',
    numero: '1',
    complemento: null,
    bairro: 'Sé',
    cidade: 'São Paulo',
    uf: 'SP',
  },
});

export class AdocoesFake implements RepositorioAdocoes {
  readonly lista: AdocaoMem[] = [];
  readonly usuarios = new Map<string, Solicitante>();
  readonly notificacoes: (ConteudoNotificacao & { para: string; entidadeId: string })[] = [];
  readonly auditoria: EntradaAuditoria[] = [];
  private relogio = new Date('2026-11-01T12:00:00Z');
  private seq = 0;

  constructor(private readonly animais: AnimaisFake) {}

  private montar(a: AdocaoMem): AdocaoDetalhada {
    const animal = this.animais.lista.find((x) => x.publicId === a.animalId);
    if (!animal) throw new Error('animal inexistente no fake');
    return { ...a, animal: { ...animal, fotoCapa: animal.fotos[0] ?? null } };
  }

  criar(d: {
    solicitanteId: string;
    animal: AnimalRegistro;
    triagem: Triagem;
    termoAceitoEm: Date;
  }) {
    const duplicada = this.lista.some(
      (a) =>
        a.solicitanteId === d.solicitanteId &&
        a.animalId === d.animal.publicId &&
        a.status === 'PENDENTE',
    );
    if (duplicada) {
      return Promise.reject(new ErroDominio('CONFLITO', 'ADOCAO_PENDENTE_EXISTENTE', 'duplicada'));
    }
    this.seq += 1;
    this.relogio = new Date(this.relogio.getTime() + 60_000);
    const nova: AdocaoMem = {
      ...d.triagem,
      id: this.seq,
      publicId: randomUUID(),
      status: 'PENDENTE',
      solicitanteId: d.solicitanteId,
      solicitante: this.usuarios.get(d.solicitanteId) ?? solicitante(d.solicitanteId),
      animalId: d.animal.publicId,
      termoAceitoEm: d.termoAceitoEm,
      analisadoEm: null,
      analisadoPor: null,
      motivoRecusa: null,
      recusaAutomatica: false,
      criadoEm: this.relogio,
    };
    this.lista.push(nova);
    return Promise.resolve(this.montar(nova));
  }

  buscar(publicId: string) {
    const a = this.lista.find((x) => x.publicId === publicId);
    return Promise.resolve(a ? this.montar(a) : null);
  }

  listar(filtro: FiltroAdocoes, cursor: CursorAdocoes | undefined, limite: number) {
    const itens = this.lista
      .filter((a) => !filtro.solicitanteId || a.solicitanteId === filtro.solicitanteId)
      .filter((a) => !filtro.status || a.status === filtro.status)
      .filter((a) => !filtro.animalId || a.animalId === filtro.animalId)
      .filter((a) => !filtro.de || a.criadoEm >= filtro.de)
      .filter((a) => !filtro.ate || a.criadoEm < filtro.ate)
      .filter(
        (a) =>
          !cursor ||
          a.criadoEm < cursor.criadoEm ||
          (a.criadoEm.getTime() === cursor.criadoEm.getTime() && a.publicId < cursor.publicId),
      )
      .sort(
        (x, y) =>
          y.criadoEm.getTime() - x.criadoEm.getTime() || y.publicId.localeCompare(x.publicId),
      )
      .slice(0, limite)
      .map((a) => this.montar(a));
    return Promise.resolve(itens);
  }

  aprovar(
    adocao: AdocaoRegistro,
    d: {
      em: Date;
      auditoria: EntradaAuditoria;
      notificacaoAprovada: ConteudoNotificacao;
      notificacaoEncerrada: ConteudoNotificacao;
      motivoEncerrada: string;
    },
  ): Promise<Encerrada[]> {
    const animal = this.animais.lista.find((x) => x.publicId === adocao.animal.publicId);
    const alvo = this.lista.find((x) => x.publicId === adocao.publicId);
    if (animal?.status !== 'DISPONIVEL' || alvo?.status !== 'PENDENTE') {
      return Promise.reject(new ErroDominio('CONFLITO', 'ADOCAO_ALTERADA', 'conflito'));
    }
    animal.status = 'ADOTADO';
    Object.assign(alvo, { status: 'APROVADA', analisadoEm: d.em, analisadoPor: 'Admin' });
    this.notificar(alvo, d.notificacaoAprovada);

    const outras = this.lista.filter(
      (x) => x.animalId === animal.publicId && x.status === 'PENDENTE' && x !== alvo,
    );
    for (const o of outras) {
      Object.assign(o, {
        status: 'RECUSADA',
        recusaAutomatica: true,
        motivoRecusa: d.motivoEncerrada,
        analisadoEm: d.em,
      });
      this.notificar(o, d.notificacaoEncerrada);
    }
    this.auditoria.push({
      ...d.auditoria,
      detalhe: { ...d.auditoria.detalhe, encerradas: outras.map((o) => o.publicId) },
    });
    return Promise.resolve(
      outras.map((o) => ({
        publicId: o.publicId,
        solicitante: o.solicitante
          ? { nome: o.solicitante.nome, email: o.solicitante.email }
          : null,
      })),
    );
  }

  recusar(
    adocao: AdocaoRegistro,
    d: { em: Date; motivo: string; auditoria: EntradaAuditoria; notificacao: ConteudoNotificacao },
  ) {
    const alvo = this.lista.find((x) => x.publicId === adocao.publicId);
    if (alvo?.status !== 'PENDENTE') {
      return Promise.reject(new ErroDominio('CONFLITO', 'ADOCAO_ALTERADA', 'conflito'));
    }
    Object.assign(alvo, {
      status: 'RECUSADA',
      motivoRecusa: d.motivo,
      analisadoEm: d.em,
      analisadoPor: 'Admin',
    });
    this.notificar(alvo, d.notificacao);
    this.auditoria.push(d.auditoria);
    return Promise.resolve();
  }

  private notificar(a: AdocaoMem, n: ConteudoNotificacao) {
    if (a.solicitanteId)
      this.notificacoes.push({ ...n, para: a.solicitanteId, entidadeId: a.publicId });
  }
}

type Enviado = DestinatarioEmail & { tipo: string; animal: string; motivo?: string };

export class EmailsAdocaoFake implements EmailsAdocao {
  readonly enviados: Enviado[] = [];
  falhar = false;

  private registrar(tipo: string, d: DestinatarioEmail & { animal: string; motivo?: string }) {
    if (this.falhar) return Promise.reject(new Error('Redis fora do ar'));
    this.enviados.push({ tipo, ...d });
    return Promise.resolve();
  }
  adocaoRecebida(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('recebida', d);
  }
  adocaoAprovada(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('aprovada', d);
  }
  adocaoRecusada(d: DestinatarioEmail & { animal: string; motivo: string }) {
    return this.registrar('recusada', d);
  }
  adocaoEncerrada(d: DestinatarioEmail & { animal: string }) {
    return this.registrar('encerrada', d);
  }
}
