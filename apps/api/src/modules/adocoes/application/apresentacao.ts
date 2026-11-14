import type { StatusAdocao, TipoMoradia } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import type { ConteudoNotificacao } from '../../../shared/aplicacao/notificacoes.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import { resumoSaida, type AnimalResumoSaida } from '../../animais/application/apresentacao.js';
import { montarTimeline, type ItemTimeline } from '../domain/adocao.js';
import type { AdocaoDetalhada, AdocaoRegistro, EnderecoSolicitante } from './portas.js';

export interface AdocaoSaida {
  readonly id: string;
  readonly status: StatusAdocao;
  readonly animal: AnimalResumoSaida;
  readonly tipoMoradia: TipoMoradia;
  readonly possuiEspacoAdequado: boolean;
  readonly outrosAnimais: string | null;
  readonly motivo: string;
  readonly termoAceitoEm: Date;
  readonly analisadoEm: Date | null;
  readonly motivoRecusa: string | null;
  readonly recusaAutomatica: boolean;
  readonly criadoEm: Date;
  readonly timeline: ItemTimeline[];
}

export interface AdocaoAdminSaida extends AdocaoSaida {
  readonly solicitante: {
    readonly id: string;
    readonly nome: string;
    readonly email: string;
    readonly telefone: string;
    readonly endereco: EnderecoSolicitante;
  } | null;
  readonly analisadoPor: string | null;
}

export const adocaoNaoEncontrada = () =>
  new ErroDominio(
    'NAO_ENCONTRADO',
    'ADOCAO_NAO_ENCONTRADA',
    'Solicitação de adoção não encontrada',
  );

export async function adocaoSaida(
  a: AdocaoRegistro,
  armazenamento: ArmazenamentoObjetos,
): Promise<AdocaoSaida> {
  return {
    id: a.publicId,
    status: a.status,
    animal: await resumoSaida(a.animal, armazenamento),
    tipoMoradia: a.tipoMoradia,
    possuiEspacoAdequado: a.possuiEspacoAdequado,
    outrosAnimais: a.outrosAnimais,
    motivo: a.motivo,
    termoAceitoEm: a.termoAceitoEm,
    analisadoEm: a.analisadoEm,
    motivoRecusa: a.motivoRecusa,
    recusaAutomatica: a.recusaAutomatica,
    criadoEm: a.criadoEm,
    timeline: montarTimeline(a),
  };
}

export async function adocaoAdminSaida(
  a: AdocaoDetalhada,
  armazenamento: ArmazenamentoObjetos,
): Promise<AdocaoAdminSaida> {
  const s = a.solicitante;
  return {
    ...(await adocaoSaida(a, armazenamento)),
    solicitante: s
      ? { id: s.publicId, nome: s.nome, email: s.email, telefone: s.telefone, endereco: s.endereco }
      : null,
    analisadoPor: a.analisadoPor,
  };
}

/**
 * Textos das notificações. Podem aparecer na tela bloqueada (push): só o nome
 * do animal, nunca o motivo da recusa nem dados do usuário.
 */
export const NOTIFICACOES = {
  aprovada: (animal: string): ConteudoNotificacao => ({
    tipo: 'ADOCAO_APROVADA',
    titulo: 'Sua adoção foi aprovada! 🎉',
    corpo: `A ONG aprovou sua solicitação para adotar ${animal}. Em breve entraremos em contato.`,
  }),
  recusada: (animal: string): ConteudoNotificacao => ({
    tipo: 'ADOCAO_RECUSADA',
    titulo: 'Sua solicitação de adoção foi analisada',
    corpo: `A solicitação para adotar ${animal} não foi aprovada. Toque para ver os detalhes.`,
  }),
  encerrada: (animal: string): ConteudoNotificacao => ({
    tipo: 'ADOCAO_ANIMAL_ADOTADO',
    titulo: `${animal} encontrou um lar 💛`,
    corpo: `${animal} foi adotado por outra família e sua solicitação foi encerrada. Conheça outros animais esperando por você!`,
  }),
} as const;
