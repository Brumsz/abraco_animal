/**
 * Dados de exemplo para desenvolvimento e demonstração (pnpm --filter @abraco/api semear).
 * Fotos: recortes dos protótipos do Paper em apps/api/semente/ — trocar pelas
 * fotos reais da ONG antes de qualquer uso público.
 */
import type { DadosAnimal } from '../modules/animais/domain/animal.js';

export interface AnimalExemplo {
  readonly dados: DadosAnimal;
  readonly foto: string;
  readonly status?: 'DISPONIVEL' | 'EM_TRATAMENTO';
}

export const ANIMAIS_EXEMPLO: readonly AnimalExemplo[] = [
  {
    foto: 'alipio.jpg',
    dados: {
      nome: 'Alípio',
      tipo: 'EQUINO',
      raca: 'Mustangue',
      idadeAprox: 96,
      sexo: 'MACHO',
      porte: 'MUITO_GRANDE',
      descricao: 'Calmo e muito carinhoso. Gosta de escovação e convive bem com outros cavalos.',
      historiaResgate:
        'Foi encontrado abaixo do peso, puxando carroça na estrada. Hoje está recuperado e pronto para um novo lar com pasto.',
      vacinado: true,
      castrado: true,
    },
  },
  {
    foto: 'pocoto.jpg',
    dados: {
      nome: 'Pocotó',
      tipo: 'EQUINO',
      raca: 'Gypsy Vanner',
      idadeAprox: 60,
      sexo: 'MACHO',
      porte: 'GRANDE',
      descricao: 'Brincalhão e curioso. Precisa de espaço para correr.',
      historiaResgate:
        'Resgatado de um haras que fechou as portas. Chegou com os cascos maltratados e já foi tratado.',
      vacinado: true,
      castrado: false,
    },
  },
  {
    foto: 'estrela.jpg',
    status: 'EM_TRATAMENTO',
    dados: {
      nome: 'Estrela',
      tipo: 'EQUINO',
      raca: 'Crioula',
      idadeAprox: 132,
      sexo: 'FEMEA',
      porte: 'GRANDE',
      descricao: 'Dócil e atenta. Está terminando o tratamento de uma lesão na pata.',
      historiaResgate:
        'Chegou após denúncia de maus-tratos. A equipe veterinária acompanha a recuperação de perto.',
      vacinado: true,
      castrado: false,
    },
  },
  {
    foto: 'pipoca.jpg',
    dados: {
      nome: 'Pipoca',
      tipo: 'CANINO',
      raca: 'Vira-lata',
      idadeAprox: 18,
      sexo: 'FEMEA',
      porte: 'MEDIO',
      descricao: 'Alegre, sociável e adora crianças e outros cães.',
      historiaResgate: 'Apareceu no sítio da ONG ainda filhote, com frio e fome. Nunca mais saiu.',
      vacinado: true,
      castrado: true,
    },
  },
  {
    foto: 'caramelo.jpg',
    dados: {
      nome: 'Caramelo',
      tipo: 'CANINO',
      raca: 'Vira-lata',
      idadeAprox: 36,
      sexo: 'MACHO',
      porte: 'MEDIO',
      descricao: 'O sorriso da ONG. Fiel, protetor e muito comilão.',
      historiaResgate: 'Foi abandonado amarrado em um poste. Hoje confia nas pessoas de novo.',
      vacinado: true,
      castrado: true,
    },
  },
  {
    foto: 'mimosa.jpg',
    dados: {
      nome: 'Mimosa',
      tipo: 'BOVINO',
      raca: 'Holandesa',
      idadeAprox: 72,
      sexo: 'FEMEA',
      porte: 'MUITO_GRANDE',
      descricao: 'Tranquila e curiosa. Precisa de pasto amplo e companhia.',
      historiaResgate: 'Seria descartada por não produzir mais leite. A ONG a acolheu.',
      vacinado: true,
      castrado: false,
    },
  },
];

export interface PostExemplo {
  readonly legenda: string;
  readonly fotos: readonly string[];
}

export const POSTS_EXEMPLO: readonly PostExemplo[] = [
  {
    legenda: 'Abraço de boas-vindas ao Alípio e à turma nova do pasto. 🧡',
    fotos: ['post-abraco.jpg'],
  },
  {
    legenda: 'Os cabritos aprovaram a reforma do curral! Obrigado a todos que doaram.',
    fotos: ['cabritos.jpg'],
  },
];

export interface NoticiaExemplo {
  readonly titulo: string;
  readonly resumo: string;
  readonly conteudo: string;
}

export const NOTICIAS_EXEMPLO: readonly NoticiaExemplo[] = [
  {
    titulo: 'Lei proíbe o uso de carroças puxadas por animais na capital',
    resumo: 'Medida entra em vigor em 2027 e prevê programa de transição para os carroceiros.',
    conteudo:
      'A nova lei municipal proíbe a circulação de veículos de tração animal.\n\n' +
      'Os cavalos recolhidos serão encaminhados a entidades de proteção, e os carroceiros ' +
      'terão acesso a cursos e linhas de crédito para trocar de atividade.',
  },
];
