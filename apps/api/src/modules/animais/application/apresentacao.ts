/**
 * Converte registros em DTOs de saída: `id` = publicId e cada foto ganha uma
 * URL assinada (o bucket nunca é exposto).
 */
import type { Porte, Sexo, StatusAnimal, TipoAnimal } from '@abraco/shared';

import type { ArmazenamentoObjetos } from '../../../shared/aplicacao/armazenamento.js';
import { ErroDominio } from '../../../shared/dominio/erros.js';
import type { AnimalCompleto, AnimalResumoRegistro, FotoRegistro } from './portas.js';

export interface FotoSaida {
  readonly id: string;
  readonly url: string;
  readonly ordem: number;
}

export interface AnimalResumoSaida {
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoAnimal;
  readonly raca: string;
  readonly idadeAprox: number;
  readonly sexo: Sexo;
  readonly porte: Porte;
  readonly status: StatusAnimal;
  readonly fotoCapa: FotoSaida | null;
}

export interface AnimalDetalheSaida extends Omit<AnimalResumoSaida, 'fotoCapa'> {
  readonly descricao: string;
  readonly historiaResgate: string;
  readonly vacinado: boolean;
  readonly castrado: boolean;
  readonly fotos: FotoSaida[];
  readonly fotoCapa: FotoSaida | null;
  readonly totalPadrinhos: number;
}

export const animalNaoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado');

export async function fotoSaida(
  foto: FotoRegistro,
  armazenamento: ArmazenamentoObjetos,
): Promise<FotoSaida> {
  return { id: foto.publicId, url: await armazenamento.urlAssinada(foto.chave), ordem: foto.ordem };
}

const campos = (a: AnimalResumoRegistro | AnimalCompleto) => ({
  id: a.publicId,
  nome: a.nome,
  tipo: a.tipo,
  raca: a.raca,
  idadeAprox: a.idadeAprox,
  sexo: a.sexo,
  porte: a.porte,
  status: a.status,
});

export async function resumoSaida(
  animal: AnimalResumoRegistro,
  armazenamento: ArmazenamentoObjetos,
): Promise<AnimalResumoSaida> {
  return {
    ...campos(animal),
    fotoCapa: animal.fotoCapa ? await fotoSaida(animal.fotoCapa, armazenamento) : null,
  };
}

export async function detalheSaida(
  animal: AnimalCompleto,
  armazenamento: ArmazenamentoObjetos,
): Promise<AnimalDetalheSaida> {
  const fotos = await Promise.all(animal.fotos.map((f) => fotoSaida(f, armazenamento)));
  return {
    ...campos(animal),
    descricao: animal.descricao,
    historiaResgate: animal.historiaResgate,
    vacinado: animal.vacinado,
    castrado: animal.castrado,
    fotos,
    fotoCapa: fotos[0] ?? null,
    totalPadrinhos: animal.totalPadrinhos,
  };
}
