/**
 * Regras da doação de um animal à ONG.
 *
 *   PENDENTE ──aprovar──▶ APROVADA ──receber──▶ RECEBIDA (cria o Animal)
 *      │                     │
 *      └──────recusar────────┴──▶ RECUSADA
 *
 * A recusa vale também depois de aprovada: a retirada pode não dar certo.
 */
import type { Porte, Sexo, StatusDoacaoAnimal, TipoAnimal } from '@abraco/shared';

import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { acessoNegado, type Ator } from '../../../shared/dominio/permissoes.js';
import { validarDadosAnimal, type DadosAnimal } from '../../animais/domain/animal.js';

export interface DadosDoacao {
  readonly nomeAnimal: string;
  readonly tipo: TipoAnimal;
  readonly raca: string;
  readonly idadeAprox: number;
  readonly sexo: Sexo;
  readonly porte: Porte;
  readonly descricao: string;
  readonly motivoDoacao: string;
  readonly enderecoRetirada: string;
}

export const LIMITES_DOACAO = {
  motivoMin: 20,
  motivoMax: 3000,
  enderecoMin: 10,
  enderecoMax: 500,
  fotosMin: 1,
} as const;

function textoEntre(valor: string, campo: string, rotulo: string, min: number, max: number) {
  const limpo = valor.trim();
  if (limpo.length < min) {
    throw erroValidacao(
      'CAMPO_CURTO',
      `${rotulo}: escreva ao menos ${String(min)} caracteres`,
      campo,
    );
  }
  if (limpo.length > max) {
    throw erroValidacao(
      'CAMPO_MUITO_LONGO',
      `${rotulo}: no máximo ${String(max)} caracteres`,
      campo,
    );
  }
  return limpo;
}

/**
 * Os dados do animal seguem as MESMAS regras do cadastro de animais (assim o
 * Animal criado ao receber sempre é válido); motivo e endereço têm regras próprias.
 */
export function validarDoacao(d: DadosDoacao): DadosDoacao {
  let animal: DadosAnimal;
  try {
    animal = validarDadosAnimal(paraDadosAnimal(d));
  } catch (erro) {
    // O formulário da doação chama o campo de `nomeAnimal`.
    if (erro instanceof ErroDominio && erro.campo === 'nome') {
      throw new ErroDominio(erro.tipo, erro.codigo, erro.message, 'nomeAnimal');
    }
    throw erro;
  }
  return {
    nomeAnimal: animal.nome,
    tipo: animal.tipo,
    raca: animal.raca,
    idadeAprox: animal.idadeAprox,
    sexo: animal.sexo,
    porte: animal.porte,
    descricao: animal.descricao,
    motivoDoacao: textoEntre(
      d.motivoDoacao,
      'motivoDoacao',
      'Motivo da doação',
      LIMITES_DOACAO.motivoMin,
      LIMITES_DOACAO.motivoMax,
    ),
    enderecoRetirada: textoEntre(
      d.enderecoRetirada,
      'enderecoRetirada',
      'Endereço de retirada',
      LIMITES_DOACAO.enderecoMin,
      LIMITES_DOACAO.enderecoMax,
    ),
  };
}

export function exigirQuantidadeFotos(quantidade: number, maximo: number): void {
  if (quantidade < LIMITES_DOACAO.fotosMin) {
    throw erroValidacao('FOTO_OBRIGATORIA', 'Envie ao menos uma foto do animal', 'fotos');
  }
  if (quantidade > maximo) {
    throw erroValidacao('LIMITE_FOTOS', `Envie no máximo ${String(maximo)} fotos`, 'fotos');
  }
}

/**
 * História pública inicial do animal criado. O `motivoDoacao` NÃO entra: foi
 * escrito pelo doador para a equipe e pode ter dados pessoais.
 */
export const HISTORIA_PADRAO =
  'Chegou à Abraço Animal por doação e está sob os cuidados da equipe. Em breve contaremos mais sobre esta história.';

/** Animal que nasce ao receber a doação (status EM_TRATAMENTO, decidido no caso de uso). */
export function paraDadosAnimal(d: DadosDoacao): DadosAnimal {
  return {
    nome: d.nomeAnimal,
    tipo: d.tipo,
    raca: d.raca,
    idadeAprox: d.idadeAprox,
    sexo: d.sexo,
    porte: d.porte,
    descricao: d.descricao,
    historiaResgate: HISTORIA_PADRAO,
    vacinado: false,
    castrado: false,
  };
}

const transicaoInvalida = (mensagem: string) =>
  new ErroDominio('CONFLITO', 'TRANSICAO_DOACAO_INVALIDA', mensagem);

export function exigirParaAprovar(status: StatusDoacaoAnimal): void {
  if (status !== 'PENDENTE') throw transicaoInvalida('Só uma doação pendente pode ser aprovada');
}

export function exigirParaRecusar(status: StatusDoacaoAnimal): void {
  if (status !== 'PENDENTE' && status !== 'APROVADA') {
    throw transicaoInvalida('Esta doação já foi concluída');
  }
}

/**
 * `true` = já recebida (o caso de uso devolve o resultado anterior: receber é
 * idempotente). Qualquer status além de APROVADA/RECEBIDA → conflito.
 */
export function jaRecebida(status: StatusDoacaoAnimal): boolean {
  if (status === 'RECEBIDA') return true;
  if (status !== 'APROVADA')
    throw transicaoInvalida('Aprove a doação antes de marcá-la como recebida');
  return false;
}

/** Só o doador ou um ADMIN veem a doação (403 para os outros, como nas adoções). */
export function exigirAcessoDoacao(ator: Ator, doadorId: string | null): void {
  if (ator.role === 'ADMIN') return;
  if (doadorId === null || doadorId !== ator.id) throw acessoNegado();
}

export type EtapaDoacao = 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'RECEBIDA' | 'RECUSADA';

export function montarTimelineDoacao(d: {
  status: StatusDoacaoAnimal;
  criadoEm: Date;
  analisadoEm: Date | null;
  recebidoEm: Date | null;
}): { etapa: EtapaDoacao; em: Date | null }[] {
  const inicio = [
    { etapa: 'ENVIADA' as const, em: d.criadoEm },
    { etapa: 'EM_ANALISE' as const, em: d.criadoEm },
  ];
  if (d.status === 'RECUSADA') return [...inicio, { etapa: 'RECUSADA', em: d.analisadoEm }];
  return [
    ...inicio,
    { etapa: 'APROVADA', em: d.status === 'PENDENTE' ? null : d.analisadoEm },
    { etapa: 'RECEBIDA', em: d.recebidoEm },
  ];
}
