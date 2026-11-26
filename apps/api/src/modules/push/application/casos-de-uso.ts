/**
 * Notificações push (Expo Push Service → FCM/APNs).
 *
 * As notificações do sino já são gravadas na mesma transação de cada alteração
 * (adoção aprovada, mensagem no chat…). O push é um "outbox": um job periódico
 * reserva as que ainda não saíram, envia aos aparelhos do dono e marca o envio.
 * Nenhum módulo precisa saber que o push existe.
 *
 * Regras:
 *  - só aparelhos com SESSÃO ATIVA no mesmo deviceId recebem (logout, troca de
 *    senha, conta desativada ou excluída cortam o push sem código extra);
 *  - entrega no máximo uma vez: a notificação é marcada ANTES do envio; se a
 *    Expo falhar, a pessoa ainda a vê no sino (nada se perde de verdade);
 *  - notificação antiga (API fora do ar por muito tempo) é marcada sem enviar;
 *  - título e corpo nunca têm dado pessoal (ver shared/aplicacao/notificacoes.ts).
 */
import type { TipoNotificacao } from '@abraco/shared';

import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';

/** Formato dos tokens da Expo: ExponentPushToken[xxx] (ou ExpoPushToken[xxx]). */
const FORMATO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

export interface NotificacaoReservada {
  readonly id: string;
  readonly usuarioId: number;
  readonly tipo: TipoNotificacao;
  readonly titulo: string;
  readonly corpo: string;
  readonly entidadeId: string | null;
  readonly criadoEm: Date;
}

export interface Aparelho {
  readonly usuarioId: number;
  readonly token: string;
}

export interface RepositorioPush {
  /** Grava (ou move para esta conta) o token do aparelho. */
  registrar(usuarioPublicId: string, deviceId: string, token: string): Promise<void>;
  remover(usuarioPublicId: string, deviceId: string): Promise<void>;
  /** Reserva e marca como enviadas até `limite` notificações pendentes (seguro entre instâncias). */
  reservarPendentes(limite: number, agora: Date): Promise<NotificacaoReservada[]>;
  /** Aparelhos dos usuários com sessão ativa no mesmo deviceId, usada desde `ativaDesde`. */
  aparelhosAtivos(usuarioIds: readonly number[], ativaDesde: Date): Promise<Aparelho[]>;
  removerTokens(tokens: readonly string[]): Promise<void>;
}

export interface MensagemPush {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  /** O app usa tipo + entidadeId para abrir a tela certa (e valida antes). */
  readonly data: {
    readonly notificacaoId: string;
    readonly tipo: string;
    readonly entidadeId: string | null;
  };
}

export type ResultadoEnvio =
  { readonly ok: true } | { readonly ok: false; readonly aparelhoInvalido: boolean };

export interface EnviadorPush {
  /** Um resultado por mensagem, na mesma ordem. */
  enviar(mensagens: readonly MensagemPush[]): Promise<ResultadoEnvio[]>;
}

export const LIMITES_PUSH = {
  /** Notificações reservadas por rodada do job. */
  lote: 200,
  /** A Expo aceita até 100 mensagens por requisição. */
  porRequisicao: 100,
  /** Mais velha que isso não vira push (só fica no sino). */
  idadeMaximaMs: 6 * 3600_000,
  /** Sessão sem uso há mais que isso (refresh expirado) não recebe. */
  sessaoAtivaDias: 30,
} as const;

function exigirDeviceId(deviceId: string): string {
  const limpo = deviceId.trim();
  if (limpo.length < 8 || limpo.length > 128) {
    throw new ErroDominio(
      'VALIDACAO',
      'DEVICE_ID_INVALIDO',
      'Identificador do aparelho inválido',
      'deviceId',
    );
  }
  return limpo;
}

export class RegistrarAparelho {
  constructor(private readonly deps: { readonly push: RepositorioPush }) {}
  async executar(entrada: { ator: Ator; deviceId: string; expoToken: string }): Promise<void> {
    const token = entrada.expoToken.trim();
    if (!FORMATO_TOKEN.test(token)) {
      throw new ErroDominio(
        'VALIDACAO',
        'TOKEN_PUSH_INVALIDO',
        'Token de notificação inválido',
        'expoToken',
      );
    }
    await this.deps.push.registrar(entrada.ator.id, exigirDeviceId(entrada.deviceId), token);
  }
}

export class RemoverAparelho {
  constructor(private readonly deps: { readonly push: RepositorioPush }) {}
  async executar(entrada: { ator: Ator; deviceId: string }): Promise<void> {
    await this.deps.push.remover(entrada.ator.id, exigirDeviceId(entrada.deviceId));
  }
}

export interface ResumoDespacho {
  readonly reservadas: number;
  readonly enviadas: number;
  readonly falhas: number;
  readonly tokensRemovidos: number;
}

export class DespacharPush {
  constructor(
    private readonly deps: {
      readonly push: RepositorioPush;
      readonly enviador: EnviadorPush;
      readonly relogio: Relogio;
    },
  ) {}

  async executar(): Promise<ResumoDespacho> {
    const agora = this.deps.relogio.agora();
    const reservadas = await this.deps.push.reservarPendentes(LIMITES_PUSH.lote, agora);
    const recentes = reservadas.filter(
      (n) => agora.getTime() - n.criadoEm.getTime() <= LIMITES_PUSH.idadeMaximaMs,
    );
    if (recentes.length === 0) {
      return { reservadas: reservadas.length, enviadas: 0, falhas: 0, tokensRemovidos: 0 };
    }

    const ativaDesde = new Date(agora.getTime() - LIMITES_PUSH.sessaoAtivaDias * 86_400_000);
    const aparelhos = await this.deps.push.aparelhosAtivos(
      [...new Set(recentes.map((n) => n.usuarioId))],
      ativaDesde,
    );
    const mensagens = montarMensagens(recentes, aparelhos);

    let enviadas = 0;
    let falhas = 0;
    const invalidos: string[] = [];
    for (let i = 0; i < mensagens.length; i += LIMITES_PUSH.porRequisicao) {
      const parte = mensagens.slice(i, i + LIMITES_PUSH.porRequisicao);
      let resultados: ResultadoEnvio[];
      try {
        resultados = await this.deps.enviador.enviar(parte);
      } catch {
        // Expo fora do ar: as notificações continuam no sino.
        falhas += parte.length;
        continue;
      }
      resultados.forEach((r, j) => {
        if (r.ok) {
          enviadas += 1;
          return;
        }
        falhas += 1;
        const token = parte[j]?.to;
        if (r.aparelhoInvalido && token) invalidos.push(token);
      });
    }
    if (invalidos.length > 0) await this.deps.push.removerTokens(invalidos);
    return { reservadas: reservadas.length, enviadas, falhas, tokensRemovidos: invalidos.length };
  }
}

/** Uma mensagem por (notificação × aparelho do dono). */
export function montarMensagens(
  notificacoes: readonly NotificacaoReservada[],
  aparelhos: readonly Aparelho[],
): MensagemPush[] {
  return notificacoes.flatMap((n) =>
    aparelhos
      .filter((a) => a.usuarioId === n.usuarioId)
      .map((a) => ({
        to: a.token,
        title: n.titulo,
        body: n.corpo,
        data: { notificacaoId: n.id, tipo: n.tipo, entidadeId: n.entidadeId },
      })),
  );
}
