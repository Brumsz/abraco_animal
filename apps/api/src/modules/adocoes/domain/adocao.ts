/**
 * Regras da adoção (seções 3, 4, 5 e 9).
 *
 * PENDENTE → APROVADA | RECUSADA. Uma adoção analisada não volta a PENDENTE.
 */
import type { StatusAdocao, TipoMoradia } from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { acessoNegado, type Ator } from '../../../shared/dominio/permissoes.js';

export const LIMITES_ADOCAO = {
  motivoMin: 50,
  motivoMax: 3000,
  outrosAnimaisMax: 1000,
  motivoRecusaMin: 10,
  motivoRecusaMax: 1000,
} as const;

export const MOTIVO_RECUSA_AUTOMATICA =
  'O animal foi adotado por outra família. Obrigado pelo carinho — há outros animais esperando por você!';

export interface EntradaTriagem {
  readonly tipoMoradia: TipoMoradia;
  readonly possuiEspacoAdequado: boolean;
  readonly outrosAnimais?: string | null | undefined;
  readonly motivo: string;
  readonly aceitouTermo: boolean;
}

export interface Triagem {
  readonly tipoMoradia: TipoMoradia;
  readonly possuiEspacoAdequado: boolean;
  readonly outrosAnimais: string | null;
  readonly motivo: string;
}

export function validarTriagem(entrada: EntradaTriagem): Triagem {
  if (!entrada.aceitouTermo) {
    throw erroValidacao('TERMO_NAO_ACEITO', 'É preciso aceitar o termo de adoção', 'aceitouTermo');
  }
  const motivo = entrada.motivo.trim();
  if (motivo.length < LIMITES_ADOCAO.motivoMin) {
    throw erroValidacao(
      'MOTIVO_CURTO',
      `Conte um pouco mais: mínimo de ${String(LIMITES_ADOCAO.motivoMin)} caracteres`,
      'motivo',
    );
  }
  if (motivo.length > LIMITES_ADOCAO.motivoMax) {
    throw erroValidacao('MOTIVO_LONGO', 'Motivo longo demais', 'motivo');
  }
  const outros = entrada.outrosAnimais?.trim() ?? '';
  if (outros.length > LIMITES_ADOCAO.outrosAnimaisMax) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Texto longo demais', 'outrosAnimais');
  }
  return {
    tipoMoradia: entrada.tipoMoradia,
    possuiEspacoAdequado: entrada.possuiEspacoAdequado,
    outrosAnimais: outros.length > 0 ? outros : null,
    motivo,
  };
}

export function validarMotivoRecusa(texto: string): string {
  const motivo = texto.trim();
  if (
    motivo.length < LIMITES_ADOCAO.motivoRecusaMin ||
    motivo.length > LIMITES_ADOCAO.motivoRecusaMax
  ) {
    throw erroValidacao(
      'MOTIVO_RECUSA_INVALIDO',
      `Explique o motivo da recusa (${String(LIMITES_ADOCAO.motivoRecusaMin)} a ${String(LIMITES_ADOCAO.motivoRecusaMax)} caracteres)`,
      'motivoRecusa',
    );
  }
  return motivo;
}

export function exigirPendente(status: StatusAdocao): void {
  if (status !== 'PENDENTE') {
    throw new ErroDominio('CONFLITO', 'ADOCAO_JA_ANALISADA', 'Esta solicitação já foi analisada');
  }
}

/** Seção 5: o admin não aprova a própria solicitação (conflito de interesse). */
export function impedirAutoaprovacao(ator: Ator, solicitanteId: string | null): void {
  if (solicitanteId !== null && solicitanteId === ator.id) {
    throw new ErroDominio(
      'PROIBIDO',
      'AUTOAPROVACAO_PROIBIDA',
      'Você não pode aprovar a sua própria solicitação. Peça a outra pessoa da equipe.',
    );
  }
}

/**
 * IDOR (seção 5): só o solicitante ou um ADMIN veem a adoção. Outro usuário
 * recebe 403, como pede a spec (o id é um UUID aleatório: não dá para varrer).
 */
export function exigirAcessoAdocao(ator: Ator, solicitanteId: string | null): void {
  if (ator.role === 'ADMIN') return;
  if (solicitanteId === null || solicitanteId !== ator.id) throw acessoNegado();
}

export type EtapaTimeline = 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'RECUSADA';

export interface ItemTimeline {
  readonly etapa: EtapaTimeline;
  /** `null` = etapa ainda não alcançada. */
  readonly em: Date | null;
}

/**
 * Linha do tempo da tela "Minhas adoções": Enviada → Em análise →
 * Aprovada/Recusada. A análise começa no envio; enquanto pendente, a etapa
 * final aparece como "Aprovada" ainda não alcançada.
 */
export function montarTimeline(a: {
  status: StatusAdocao;
  criadoEm: Date;
  analisadoEm: Date | null;
}): ItemTimeline[] {
  return [
    { etapa: 'ENVIADA', em: a.criadoEm },
    { etapa: 'EM_ANALISE', em: a.criadoEm },
    a.status === 'RECUSADA'
      ? { etapa: 'RECUSADA', em: a.analisadoEm }
      : { etapa: 'APROVADA', em: a.status === 'APROVADA' ? a.analisadoEm : null },
  ];
}
