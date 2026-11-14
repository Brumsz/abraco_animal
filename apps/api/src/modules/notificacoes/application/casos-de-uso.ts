/**
 * Notificações do sino. Cada usuário só enxerga e altera as próprias: o dono
 * vem do token (ator), nunca de parâmetro.
 */
import type { TipoNotificacao } from '@abraco/shared';

import type { Relogio } from '../../../shared/aplicacao/relogio.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { Ator } from '../../../shared/dominio/permissoes.js';

export interface NotificacaoRegistro {
  readonly publicId: string;
  readonly tipo: TipoNotificacao;
  readonly titulo: string;
  readonly corpo: string;
  readonly entidadeId: string | null;
  readonly lidaEm: Date | null;
  readonly criadoEm: Date;
}

export interface CursorNotificacoes {
  readonly criadoEm: Date;
  readonly publicId: string;
}

export interface RepositorioNotificacoes {
  listar(
    usuarioId: string,
    cursor: CursorNotificacoes | undefined,
    limite: number,
  ): Promise<NotificacaoRegistro[]>;
  contarNaoLidas(usuarioId: string): Promise<number>;
  /** `false` se a notificação não existe OU é de outro usuário (indistinguível de fora). */
  marcarLida(usuarioId: string, id: string, em: Date): Promise<boolean>;
  marcarTodasLidas(usuarioId: string, em: Date): Promise<void>;
}

interface Deps {
  readonly notificacoes: RepositorioNotificacoes;
  readonly relogio: Relogio;
}

export const LIMITE_PAGINA_NOTIFICACOES = { padrao: 20, maximo: 50 } as const;

export class ListarNotificacoes {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; cursor?: CursorNotificacoes; limite?: number }) {
    const n = Math.min(
      Math.max(Math.trunc(entrada.limite ?? LIMITE_PAGINA_NOTIFICACOES.padrao), 1),
      LIMITE_PAGINA_NOTIFICACOES.maximo,
    );
    const registros = await this.deps.notificacoes.listar(entrada.ator.id, entrada.cursor, n + 1);
    const itens = registros.slice(0, n);
    const ultimo = itens.at(-1);
    return {
      itens: itens.map((r) => ({ ...r, id: r.publicId })),
      proximoCursor:
        registros.length > n && ultimo
          ? { criadoEm: ultimo.criadoEm, publicId: ultimo.publicId }
          : null,
    };
  }
}

export class ContarNaoLidas {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }): Promise<{ total: number }> {
    return { total: await this.deps.notificacoes.contarNaoLidas(entrada.ator.id) };
  }
}

export class MarcarNotificacaoLida {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    const ok = await this.deps.notificacoes.marcarLida(
      entrada.ator.id,
      entrada.id,
      this.deps.relogio.agora(),
    );
    // 404 também para a de outra pessoa: não confirma que o id existe.
    if (!ok) {
      throw new ErroDominio(
        'NAO_ENCONTRADO',
        'NOTIFICACAO_NAO_ENCONTRADA',
        'Notificação não encontrada',
      );
    }
  }
}

export class MarcarTodasLidas {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }): Promise<void> {
    await this.deps.notificacoes.marcarTodasLidas(entrada.ator.id, this.deps.relogio.agora());
  }
}
