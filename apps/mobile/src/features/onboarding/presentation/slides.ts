import { HandHeartIcon, HorseIcon, NewspaperIcon, type Icon } from 'phosphor-react-native';

export interface Slide {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  readonly Icone: Icon;
}

/**
 * Conteúdo do onboarding (seção 4). O texto do slide 1 preserva o sentido do
 * texto institucional oficial. As ilustrações são provisórias até a ONG enviar
 * as fotos (o slide 1 pede uma foto de cavalo).
 */
export const SLIDES: readonly Slide[] = [
  {
    id: 'amar',
    titulo: 'Amar os animais é agir para protegê-los',
    texto:
      'Na Abraço Animal resgatamos cavalos e outros animais que precisam de cuidado especial após serem salvos de situações de abuso.',
    Icone: HorseIcon,
  },
  {
    id: 'jornal',
    titulo: 'Jornal Abraço Animal',
    texto:
      'Acompanhe notícias sobre os animais no Brasil e as novidades de quem vive no nosso Santuário.',
    Icone: NewspaperIcon,
  },
  {
    id: 'verbos',
    titulo: 'Verbos do Amor ♡',
    texto:
      'Doar, adotar, voluntariar e apadrinhar: mantidos 100% por doações, contamos com você para continuar cuidando de cada um deles.',
    Icone: HandHeartIcon,
  },
];
