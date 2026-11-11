/**
 * Enums do domínio compartilhados entre API e app.
 * Espelham os enums de apps/api/prisma/schema.prisma — o teste de contrato
 * da API (Etapa 3+) garante que continuem iguais.
 */
export const ROLES = ['USUARIO', 'VOLUNTARIO', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const TIPOS_ANIMAL = ['EQUINO', 'CANINO', 'BOVINO', 'OUTRO'] as const;
export type TipoAnimal = (typeof TIPOS_ANIMAL)[number];

export const SEXOS = ['MACHO', 'FEMEA'] as const;
export type Sexo = (typeof SEXOS)[number];

export const PORTES = ['PEQUENO', 'MEDIO', 'GRANDE', 'MUITO_GRANDE'] as const;
export type Porte = (typeof PORTES)[number];

export const STATUS_ANIMAL = ['DISPONIVEL', 'EM_TRATAMENTO', 'ADOTADO', 'INDISPONIVEL'] as const;
export type StatusAnimal = (typeof STATUS_ANIMAL)[number];

export const STATUS_ADOCAO = ['PENDENTE', 'APROVADA', 'RECUSADA'] as const;
export type StatusAdocao = (typeof STATUS_ADOCAO)[number];

export const TIPOS_MORADIA = [
  'CASA_COM_QUINTAL',
  'CASA_SEM_QUINTAL',
  'APARTAMENTO',
  'CHACARA',
  'FAZENDA',
] as const;
export type TipoMoradia = (typeof TIPOS_MORADIA)[number];

export const STATUS_DOACAO_ANIMAL = ['PENDENTE', 'APROVADA', 'RECUSADA', 'RECEBIDA'] as const;
export type StatusDoacaoAnimal = (typeof STATUS_DOACAO_ANIMAL)[number];

export const STATUS_DOACAO_FINANCEIRA = ['PENDENTE', 'CONFIRMADA', 'EXPIRADA'] as const;
export type StatusDoacaoFinanceira = (typeof STATUS_DOACAO_FINANCEIRA)[number];

export const TIPOS_NOTIFICACAO = [
  'ADOCAO_APROVADA',
  'ADOCAO_RECUSADA',
  'ADOCAO_ANIMAL_ADOTADO',
  'DOACAO_ANIMAL_ATUALIZADA',
  'DOACAO_FINANCEIRA_CONFIRMADA',
  'VOLUNTARIADO_ATUALIZADO',
  'CHAT_NOVA_MENSAGEM',
  'GERAL',
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

/** Regra de negócio D6: só animais DISPONIVEL podem ser apadrinhados. */
export const STATUS_APADRINHAVEIS: readonly StatusAnimal[] = ['DISPONIVEL'];

/** Regra de negócio D7: idade mínima para cadastro. */
export const IDADE_MINIMA_CADASTRO = 18;
