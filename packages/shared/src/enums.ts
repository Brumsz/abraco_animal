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

export const STATUS_VOLUNTARIO = ['PENDENTE', 'APROVADO', 'RECUSADO'] as const;
export type StatusVoluntario = (typeof STATUS_VOLUNTARIO)[number];

export const AREAS_INTERESSE = [
  'CUIDADO_ANIMAIS',
  'EVENTOS',
  'REDES_SOCIAIS',
  'TRANSPORTE',
  'CAPTACAO_RECURSOS',
  'OUTROS',
] as const;
export type AreaInteresse = (typeof AREAS_INTERESSE)[number];

export const DIAS_SEMANA = [
  'DOMINGO',
  'SEGUNDA',
  'TERCA',
  'QUARTA',
  'QUINTA',
  'SEXTA',
  'SABADO',
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const TURNOS = ['MANHA', 'TARDE', 'NOITE'] as const;
export type Turno = (typeof TURNOS)[number];

export const STATUS_CONVERSA = ['ABERTA', 'ENCERRADA'] as const;
export type StatusConversa = (typeof STATUS_CONVERSA)[number];

/** Ordem de exibição das seções da página "Sobre a ONG". */
export const SECOES_PERFIL_ONG = ['SOBRE_NOS', 'FUNDACAO', 'FUNDADORES'] as const;
export type SecaoPerfilOng = (typeof SECOES_PERFIL_ONG)[number];

/** Regra de negócio D6: só animais DISPONIVEL podem ser apadrinhados. */
export const STATUS_APADRINHAVEIS: readonly StatusAnimal[] = ['DISPONIVEL'];

/** Regra de negócio D7: idade mínima para cadastro. */
export const IDADE_MINIMA_CADASTRO = 18;

/** Status que o público vê no detalhe do animal (INDISPONIVEL fica só para a equipe). */
export const STATUS_VISIVEIS_PUBLICO: readonly StatusAnimal[] = [
  'DISPONIVEL',
  'EM_TRATAMENTO',
  'ADOTADO',
];

/** Limites de upload de imagens (seção 6). O app valida antes de enviar; a API, sempre. */
export const UPLOAD_IMAGENS = {
  tamanhoMaximoBytes: 5 * 1024 * 1024,
  arquivosPorEnvio: 10,
  fotosPorAnimal: 10,
} as const;
