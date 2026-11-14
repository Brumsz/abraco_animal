/**
 * Regras do Animal (seção 9: "invariantes de status").
 *
 * - ADOTADO só é alcançado pela aprovação de uma adoção (Etapa 5), nunca
 *   manualmente: senão o animal fica "adotado" sem adotante registrado.
 * - Sair de ADOTADO é permitido (devolução do animal à ONG).
 * - O público nunca vê animais INDISPONIVEL.
 */
import {
  STATUS_VISIVEIS_PUBLICO,
  type Porte,
  type Role,
  type Sexo,
  type StatusAnimal,
  type TipoAnimal,
} from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';

export interface DadosAnimal {
  readonly nome: string;
  readonly tipo: TipoAnimal;
  readonly raca: string;
  /** Idade aproximada em meses. */
  readonly idadeAprox: number;
  readonly sexo: Sexo;
  readonly porte: Porte;
  readonly descricao: string;
  readonly historiaResgate: string;
  readonly vacinado: boolean;
  readonly castrado: boolean;
}

export const LIMITES_ANIMAL = {
  nome: 80,
  raca: 80,
  descricao: 5000,
  historiaResgate: 10000,
  /** 50 anos — cavalos vivem até ~30; margem para erro de digitação não passar. */
  idadeMaximaMeses: 600,
} as const;

/** Status aceitos ao cadastrar e na troca manual pelo admin. */
export const STATUS_MANUAIS: readonly StatusAnimal[] = [
  'DISPONIVEL',
  'EM_TRATAMENTO',
  'INDISPONIVEL',
];

const ROLES_EQUIPE: readonly Role[] = ['ADMIN', 'VOLUNTARIO'];

function texto(valor: string, campo: keyof typeof LIMITES_ANIMAL, rotulo: string): string {
  // Colapsa espaços só em campos de uma linha; textos longos mantêm quebras.
  const limpo =
    campo === 'nome' || campo === 'raca' ? valor.trim().replace(/\s+/g, ' ') : valor.trim();
  if (limpo.length === 0) {
    throw erroValidacao('CAMPO_OBRIGATORIO', `${rotulo} é obrigatório`, campo);
  }
  if (limpo.length > LIMITES_ANIMAL[campo]) {
    throw erroValidacao(
      'CAMPO_MUITO_LONGO',
      `${rotulo} deve ter no máximo ${String(LIMITES_ANIMAL[campo])} caracteres`,
      campo,
    );
  }
  return limpo;
}

/** Valida e normaliza os dados de cadastro/edição. */
export function validarDadosAnimal(entrada: DadosAnimal): DadosAnimal {
  if (
    !Number.isInteger(entrada.idadeAprox) ||
    entrada.idadeAprox < 0 ||
    entrada.idadeAprox > LIMITES_ANIMAL.idadeMaximaMeses
  ) {
    throw erroValidacao('IDADE_INVALIDA', 'Idade aproximada inválida', 'idadeAprox');
  }
  return {
    ...entrada,
    nome: texto(entrada.nome, 'nome', 'Nome'),
    raca: texto(entrada.raca, 'raca', 'Raça'),
    descricao: texto(entrada.descricao, 'descricao', 'Descrição'),
    historiaResgate: texto(entrada.historiaResgate, 'historiaResgate', 'História do resgate'),
  };
}

export function validarStatusInicial(status: StatusAnimal): StatusAnimal {
  if (!STATUS_MANUAIS.includes(status)) {
    throw erroValidacao(
      'STATUS_INICIAL_INVALIDO',
      'Um animal novo não pode ser cadastrado como adotado',
      'status',
    );
  }
  return status;
}

/**
 * Troca manual de status pelo admin. Retorna `null` quando não há mudança
 * (idempotente: não gera auditoria nem escrita).
 */
export function transicaoManual(atual: StatusAnimal, novo: StatusAnimal): StatusAnimal | null {
  if (atual === novo) return null;
  if (!STATUS_MANUAIS.includes(novo)) {
    throw new ErroDominio(
      'CONFLITO',
      'TRANSICAO_STATUS_INVALIDA',
      'O status ADOTADO é definido pela aprovação de uma adoção',
      'status',
    );
  }
  return novo;
}

/** Usado pela aprovação de adoção (Etapa 5): só um animal disponível pode ser adotado. */
export function transicaoParaAdotado(atual: StatusAnimal): 'ADOTADO' {
  if (atual !== 'DISPONIVEL') {
    throw new ErroDominio(
      'CONFLITO',
      'ANIMAL_NAO_DISPONIVEL',
      'Este animal não está disponível para adoção',
    );
  }
  return 'ADOTADO';
}

export const ehEquipe = (role: Role | undefined): boolean =>
  role !== undefined && ROLES_EQUIPE.includes(role);

/** Quem pode ver um animal com este status no detalhe. */
export function podeVerAnimal(status: StatusAnimal, role: Role | undefined): boolean {
  return ehEquipe(role) || STATUS_VISIVEIS_PUBLICO.includes(status);
}

/**
 * Status filtrados na listagem: o público vê só DISPONIVEL (seção 4); a equipe
 * vê todos ou filtra por um.
 */
export function statusDaListagem(
  role: Role | undefined,
  pedido: StatusAnimal | undefined,
): readonly StatusAnimal[] | undefined {
  if (!ehEquipe(role)) return ['DISPONIVEL'];
  return pedido ? [pedido] : undefined;
}
