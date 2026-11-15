/**
 * Candidatura de voluntariado (formulário da seção 4).
 *
 *   PENDENTE ──aprovar──▶ APROVADO (usuário vira VOLUNTARIO)
 *      └─────recusar───▶ RECUSADO ──nova candidatura──▶ PENDENTE
 */
import type { AreaInteresse, DiaSemana, Role, StatusVoluntario, Turno } from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';

export const LIMITES_CANDIDATURA = {
  motivacaoMin: 20,
  motivacaoMax: 3000,
  habilidadesMax: 3000,
  outrosMax: 200,
  cargoMax: 80,
} as const;

export interface EntradaCandidatura {
  readonly areasInteresse: readonly AreaInteresse[];
  readonly areaInteresseOutros?: string | null | undefined;
  readonly disponibilidadeDias: readonly DiaSemana[];
  readonly turnos: readonly Turno[];
  readonly motivacao: string;
  readonly habilidades?: string | null | undefined;
}

export interface DadosCandidatura {
  readonly areasInteresse: AreaInteresse[];
  readonly areaInteresseOutros: string | null;
  readonly disponibilidadeDias: DiaSemana[];
  readonly turnos: Turno[];
  readonly motivacao: string;
  readonly habilidades: string | null;
}

function lista<T>(valores: readonly T[], campo: string, rotulo: string): T[] {
  const unicos = [...new Set(valores)];
  if (unicos.length === 0)
    throw erroValidacao('CAMPO_OBRIGATORIO', `Escolha ao menos um(a) ${rotulo}`, campo);
  return unicos;
}

export function validarCandidatura(e: EntradaCandidatura): DadosCandidatura {
  const areasInteresse = lista(e.areasInteresse, 'areasInteresse', 'área de interesse');
  const outros = e.areaInteresseOutros?.trim() ?? '';
  if (areasInteresse.includes('OUTROS') && outros.length === 0) {
    throw erroValidacao(
      'CAMPO_OBRIGATORIO',
      'Conte qual é a outra área de interesse',
      'areaInteresseOutros',
    );
  }
  if (outros.length > LIMITES_CANDIDATURA.outrosMax) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Texto longo demais', 'areaInteresseOutros');
  }
  const motivacao = e.motivacao.trim();
  if (motivacao.length < LIMITES_CANDIDATURA.motivacaoMin) {
    throw erroValidacao(
      'MOTIVACAO_CURTA',
      `Conte um pouco mais: mínimo de ${String(LIMITES_CANDIDATURA.motivacaoMin)} caracteres`,
      'motivacao',
    );
  }
  if (motivacao.length > LIMITES_CANDIDATURA.motivacaoMax) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Texto longo demais', 'motivacao');
  }
  const habilidades = e.habilidades?.trim() ?? '';
  if (habilidades.length > LIMITES_CANDIDATURA.habilidadesMax) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Texto longo demais', 'habilidades');
  }
  return {
    areasInteresse,
    // "Outros" só é guardado quando a área OUTROS foi marcada.
    areaInteresseOutros: areasInteresse.includes('OUTROS') ? outros : null,
    disponibilidadeDias: lista(e.disponibilidadeDias, 'disponibilidadeDias', 'dia da semana'),
    turnos: lista(e.turnos, 'turnos', 'turno'),
    motivacao,
    habilidades: habilidades.length > 0 ? habilidades : null,
  };
}

const conflito = (codigo: string, mensagem: string) =>
  new ErroDominio('CONFLITO', codigo, mensagem);

/** Quem pode enviar (ou reenviar) uma candidatura. */
export function exigirPodeCandidatar(role: Role, atual: StatusVoluntario | null): void {
  if (role !== 'USUARIO') throw conflito('JA_E_DA_EQUIPE', 'Você já faz parte da equipe da ONG');
  if (atual === 'PENDENTE')
    throw conflito('CANDIDATURA_EM_ANALISE', 'Sua candidatura já está em análise');
  if (atual === 'APROVADO') throw conflito('JA_E_VOLUNTARIO', 'Você já é voluntário(a)');
}

export function exigirCandidaturaPendente(status: StatusVoluntario): void {
  if (status !== 'PENDENTE') {
    throw conflito('CANDIDATURA_JA_ANALISADA', 'Esta candidatura já foi analisada');
  }
}

export function validarCargo(cargo: string | null | undefined): string | null {
  const limpo = cargo?.trim() ?? '';
  if (limpo.length > LIMITES_CANDIDATURA.cargoMax) {
    throw erroValidacao('CAMPO_MUITO_LONGO', 'Cargo longo demais', 'cargo');
  }
  return limpo.length > 0 ? limpo : null;
}
