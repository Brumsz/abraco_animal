/** Fakes do módulo Pix (só testes unitários). */
import { randomUUID } from 'node:crypto';

import type { ConteudoNotificacao } from '../../../../shared/aplicacao/notificacoes.js';
import type { Dinheiro } from '../../../../shared/dominio/dinheiro.js';
import { ErroDominio } from '../../../../shared/dominio/erros.js';
import type {
  ConsultaCobranca,
  CursorDoacoesFinanceiras,
  DoacaoFinanceiraRegistro,
  EmailsDoacaoFinanceira,
  EventoWebhook,
  GatewayPix,
  NovaDoacaoFinanceira,
  RepositorioDoacoesFinanceiras,
  SituacaoCobranca,
} from '../portas.js';

type Mutavel<T> = { -readonly [K in keyof T]: T[K] };

export class GatewayFake implements GatewayPix {
  readonly cobrancas = new Map<
    string,
    { situacao: SituacaoCobranca; valor: Dinheiro; referencia: string }
  >();
  readonly canceladas: string[] = [];
  consultas = 0;
  falharCriacao = false;
  falharConsulta = false;
  /** Faz o PSP "dizer" um valor diferente do cobrado. */
  valorInformado: Dinheiro | null = null;
  private seq = 0;

  criarCobranca(d: { referencia: string; valor: Dinheiro; descricao: string; expiraEm: Date }) {
    if (this.falharCriacao) {
      return Promise.reject(new ErroDominio('SERVICO_EXTERNO', 'PSP_INDISPONIVEL', 'fora do ar'));
    }
    this.seq += 1;
    const pspTxId = `pay_${String(this.seq)}`;
    this.cobrancas.set(pspTxId, { situacao: 'PENDENTE', valor: d.valor, referencia: d.referencia });
    return Promise.resolve({ pspTxId, copiaCola: `000201...${pspTxId}` });
  }

  consultarCobranca(pspTxId: string): Promise<ConsultaCobranca> {
    this.consultas += 1;
    if (this.falharConsulta) {
      return Promise.reject(new ErroDominio('SERVICO_EXTERNO', 'PSP_INDISPONIVEL', 'fora do ar'));
    }
    const c = this.cobrancas.get(pspTxId);
    if (!c) return Promise.reject(new Error('cobrança inexistente'));
    return Promise.resolve({ situacao: c.situacao, valor: this.valorInformado ?? c.valor });
  }

  cancelarCobranca(pspTxId: string) {
    this.canceladas.push(pspTxId);
    const c = this.cobrancas.get(pspTxId);
    if (c?.situacao === 'PENDENTE') c.situacao = 'CANCELADA';
    return Promise.resolve();
  }

  pagar(pspTxId: string) {
    const c = this.cobrancas.get(pspTxId);
    if (c) c.situacao = 'PAGA';
  }
}

interface Usuario {
  nome: string;
  email: string;
}

export class DoacoesPixFake implements RepositorioDoacoesFinanceiras {
  readonly lista: (Mutavel<DoacaoFinanceiraRegistro> & {
    notificacoes: ConteudoNotificacao[];
  })[] = [];
  readonly eventos = new Set<string>();
  readonly usuarios = new Map<string, Usuario>();
  falharCriacao: ErroDominio | null = null;
  private seq = 0;
  private t = Date.parse('2026-11-01T12:00:00Z');

  criar(d: NovaDoacaoFinanceira) {
    if (this.falharCriacao) return Promise.reject(this.falharCriacao);
    if (this.lista.some((x) => x.idempotencyKey === d.idempotencyKey)) {
      return Promise.reject(new ErroDominio('CONFLITO', 'IDEMPOTENCIA_EM_USO', 'em uso'));
    }
    this.seq += 1;
    this.t += 1000;
    const nova = {
      ...d,
      id: this.seq,
      status: 'PENDENTE' as const,
      pagoEm: null,
      criadoEm: new Date(this.t),
      notificacoes: [],
    };
    this.lista.push(nova);
    return Promise.resolve({ ...nova });
  }

  private achar(f: (d: DoacaoFinanceiraRegistro) => boolean) {
    const d = this.lista.find(f);
    return Promise.resolve(d ? { ...d } : null);
  }
  buscar(publicId: string) {
    return this.achar((d) => d.publicId === publicId);
  }
  buscarPorIdempotencia(chave: string) {
    return this.achar((d) => d.idempotencyKey === chave);
  }
  buscarPorPspTxId(pspTxId: string) {
    return this.achar((d) => d.pspTxId === pspTxId);
  }

  listarDoUsuario(usuarioId: string, cursor: CursorDoacoesFinanceiras | undefined, limite: number) {
    return Promise.resolve(
      this.lista
        .filter((d) => d.usuarioId === usuarioId)
        .filter((d) => !cursor || d.criadoEm < cursor.criadoEm)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite),
    );
  }

  marcarExpirada(doacao: DoacaoFinanceiraRegistro) {
    const d = this.lista.find((x) => x.id === doacao.id);
    if (d?.status === 'PENDENTE') d.status = 'EXPIRADA';
    return Promise.resolve();
  }

  confirmar(
    doacao: DoacaoFinanceiraRegistro,
    p: { pagoEm: Date; evento?: EventoWebhook; notificacao: ConteudoNotificacao },
  ) {
    if (p.evento) {
      const chave = `${p.evento.provedor}:${p.evento.eventoId}`;
      if (this.eventos.has(chave)) return Promise.resolve({ resultado: 'duplicado' as const });
      this.eventos.add(chave);
    }
    const d = this.lista.find((x) => x.id === doacao.id);
    if (!d || d.status === 'CONFIRMADA')
      return Promise.resolve({ resultado: 'ja_confirmada' as const });
    d.status = 'CONFIRMADA';
    d.pagoEm = p.pagoEm;
    const usuario = d.usuarioId ? this.usuarios.get(d.usuarioId) : undefined;
    if (usuario) d.notificacoes.push(p.notificacao);
    const comprovante = usuario
      ? { email: usuario.email, nome: usuario.nome }
      : d.emailDoador
        ? { email: d.emailDoador, nome: d.nomeDoador ?? 'doador(a)' }
        : null;
    return Promise.resolve({ resultado: 'confirmada' as const, comprovante });
  }

  registrarEvento(evento: EventoWebhook) {
    const chave = `${evento.provedor}:${evento.eventoId}`;
    if (this.eventos.has(chave)) return Promise.resolve(false);
    this.eventos.add(chave);
    return Promise.resolve(true);
  }
}

export class ComprovantesFake implements EmailsDoacaoFinanceira {
  readonly enviados: { para: string; nome: string; valor: string }[] = [];
  comprovanteDoacao(d: { para: string; nome: string; valor: string; data: Date }) {
    this.enviados.push({ para: d.para, nome: d.nome, valor: d.valor });
    return Promise.resolve();
  }
}

export const novaChave = () => randomUUID();
