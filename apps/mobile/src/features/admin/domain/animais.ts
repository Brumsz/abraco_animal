/**
 * Cadastro de animais pela equipe. Mesmos limites da API (domínio de animais):
 * nome e raça até 80, descrição até 5000, história até 10000, idade até 50 anos.
 */
import type { AnimalDetalhe } from '@abraco/api-client';
import type { StatusAnimal } from '@abraco/shared';
import type { StatusBadge } from '@abraco/ui';
import { z } from 'zod';

const texto = (rotulo: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}`)
    .max(max, `No máximo ${String(max)} caracteres`);

const numero = (max: number, mensagem: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, 'Só números')
    .refine((v) => v === '' || Number(v) <= max, mensagem);

/** Status que a equipe escolhe à mão (ADOTADO só pela aprovação de uma adoção). */
export const STATUS_MANUAIS = ['DISPONIVEL', 'EM_TRATAMENTO', 'INDISPONIVEL'] as const;

export const STATUS_ANIMAL_EQUIPE: Record<StatusAnimal, { texto: string; badge: StatusBadge }> = {
  DISPONIVEL: { texto: 'Disponível', badge: 'APROVADA' },
  EM_TRATAMENTO: { texto: 'Em tratamento', badge: 'EM_TRATAMENTO' },
  ADOTADO: { texto: 'Adotado', badge: 'DESTAQUE' },
  INDISPONIVEL: { texto: 'Indisponível', badge: 'NEUTRO' },
};

export const FILTROS_ANIMAL = [
  { valor: null, rotulo: 'Todos' },
  { valor: 'DISPONIVEL', rotulo: 'Disponíveis' },
  { valor: 'EM_TRATAMENTO', rotulo: 'Em tratamento' },
  { valor: 'ADOTADO', rotulo: 'Adotados' },
  { valor: 'INDISPONIVEL', rotulo: 'Indisponíveis' },
] as const satisfies readonly { valor: StatusAnimal | null; rotulo: string }[];

export const esquemaAnimal = z
  .object({
    nome: texto('o nome', 80),
    tipo: z.enum(['EQUINO', 'CANINO', 'BOVINO', 'OUTRO'], { error: 'Escolha a espécie' }),
    raca: texto('a raça (ou "sem raça definida")', 80),
    anos: numero(50, 'Até 50 anos'),
    meses: numero(11, 'De 0 a 11 meses'),
    sexo: z.enum(['MACHO', 'FEMEA'], { error: 'Escolha o sexo' }),
    porte: z.enum(['PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE'], { error: 'Escolha o porte' }),
    descricao: texto('a descrição', 5000),
    historiaResgate: texto('a história do resgate', 10000),
    vacinado: z.boolean(),
    castrado: z.boolean(),
    /** Só no cadastro; depois o status muda pela tela do animal. */
    status: z.enum(STATUS_MANUAIS),
  })
  .refine((f) => f.anos !== '' || f.meses !== '', {
    path: ['anos'],
    message: 'Informe a idade aproximada',
  });

export type FormAnimal = z.input<typeof esquemaAnimal>;

export const FORM_ANIMAL_VAZIO: FormAnimal = {
  nome: '',
  raca: '',
  anos: '',
  meses: '',
  descricao: '',
  historiaResgate: '',
  vacinado: false,
  castrado: false,
  status: 'EM_TRATAMENTO',
} as FormAnimal;

/** Ficha da API → formulário de edição (idade em meses vira anos + meses). */
export function valoresDoAnimal(a: AnimalDetalhe): FormAnimal {
  const anos = Math.floor(a.idadeAprox / 12);
  const meses = a.idadeAprox % 12;
  return {
    nome: a.nome,
    tipo: a.tipo,
    raca: a.raca,
    anos: anos > 0 ? String(anos) : '',
    meses: meses > 0 || anos === 0 ? String(meses) : '',
    sexo: a.sexo,
    porte: a.porte,
    descricao: a.descricao,
    historiaResgate: a.historiaResgate,
    vacinado: a.vacinado,
    castrado: a.castrado,
    // Status não é editado aqui (rota própria); o valor só satisfaz o formulário.
    status: a.status === 'ADOTADO' ? 'INDISPONIVEL' : a.status,
  };
}

/** Formulário → corpo da API (sem status: ele só vai no cadastro). */
export function corpoAnimal(f: z.output<typeof esquemaAnimal>) {
  const { nome, tipo, raca, sexo, porte, descricao, historiaResgate, vacinado, castrado } = f;
  const idadeAprox = Number(f.anos || 0) * 12 + Number(f.meses || 0);
  return {
    nome,
    tipo,
    raca,
    idadeAprox,
    sexo,
    porte,
    descricao,
    historiaResgate,
    vacinado,
    castrado,
  };
}

/** Move a foto `id` uma posição (−1 = para a frente, +1 = para trás). Fora dos limites: igual. */
export function moverFoto(ids: readonly string[], id: string, direcao: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const novo = [...ids];
  novo.splice(i, 1);
  novo.splice(j, 0, id);
  return novo;
}
