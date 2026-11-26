/** Regras de tela do painel da equipe (funções puras, testáveis). */
import type { Dashboard } from '@abraco/api-client';
import type { StatusBadge } from '@abraco/ui';
import type { StatusAdocao, StatusDoacaoAnimal, StatusVoluntario } from '@abraco/shared';

import { mascararCep } from '@/features/auth/domain/mascaras';
import { mesAbreviado } from '@/shared/tempo';

interface Rotulo {
  readonly texto: string;
  readonly badge: StatusBadge;
}

/** Visão da equipe (no app do usuário os textos são outros: "Em análise", "Não aprovada"). */
export const STATUS_ADOCAO_EQUIPE: Record<StatusAdocao, Rotulo> = {
  PENDENTE: { texto: 'Pendente', badge: 'PENDENTE' },
  APROVADA: { texto: 'Aprovada', badge: 'APROVADA' },
  RECUSADA: { texto: 'Recusada', badge: 'RECUSADA' },
};

export const STATUS_DOACAO_EQUIPE: Record<StatusDoacaoAnimal, Rotulo> = {
  PENDENTE: { texto: 'Pendente', badge: 'PENDENTE' },
  APROVADA: { texto: 'Aguardando retirada', badge: 'EM_TRATAMENTO' },
  RECUSADA: { texto: 'Recusada', badge: 'RECUSADA' },
  RECEBIDA: { texto: 'Recebida', badge: 'APROVADA' },
};

export const STATUS_VOLUNTARIO_EQUIPE: Record<StatusVoluntario, Rotulo> = {
  PENDENTE: { texto: 'Candidatura', badge: 'PENDENTE' },
  APROVADO: { texto: 'Ativo', badge: 'APROVADA' },
  RECUSADO: { texto: 'Recusado', badge: 'RECUSADA' },
};

/** Filtros das listas: o primeiro é o padrão (o que precisa de ação). */
export const FILTROS_ADOCAO = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'RECUSADA', rotulo: 'Recusadas' },
  { valor: null, rotulo: 'Todas' },
] as const satisfies readonly { valor: StatusAdocao | null; rotulo: string }[];

export const FILTROS_DOACAO = [
  { valor: 'PENDENTE', rotulo: 'Pendentes' },
  { valor: 'APROVADA', rotulo: 'Retirar' },
  { valor: 'RECEBIDA', rotulo: 'Recebidas' },
  { valor: 'RECUSADA', rotulo: 'Recusadas' },
  { valor: null, rotulo: 'Todas' },
] as const satisfies readonly { valor: StatusDoacaoAnimal | null; rotulo: string }[];

export const FILTROS_VOLUNTARIO = [
  { valor: 'PENDENTE', rotulo: 'Candidaturas' },
  { valor: 'APROVADO', rotulo: 'Ativos' },
  { valor: 'RECUSADO', rotulo: 'Recusados' },
] as const satisfies readonly { valor: StatusVoluntario; rotulo: string }[];

/** Mesmos limites da API (domínio de adoções): a tela avisa antes de enviar. */
export const MOTIVO_RECUSA = { min: 10, max: 1000 } as const;

export function problemaMotivoRecusa(motivo: string): string | null {
  const n = motivo.trim().length;
  if (n < MOTIVO_RECUSA.min) {
    return `Explique o motivo com pelo menos ${String(MOTIVO_RECUSA.min)} caracteres. A pessoa recebe esse texto por e-mail.`;
  }
  return n > MOTIVO_RECUSA.max ? `Use até ${String(MOTIVO_RECUSA.max)} caracteres.` : null;
}

export interface Barra {
  readonly mes: string;
  readonly rotulo: string;
  readonly total: number;
  /** 0 a 1, em relação ao maior mês (para a altura da barra). */
  readonly proporcao: number;
}

/** Gráfico "Adoções por mês": altura proporcional ao maior mês (todos zero → barras vazias). */
export function barrasPorMes(meses: Dashboard['adocoesPorMes']): Barra[] {
  const maior = Math.max(0, ...meses.map((m) => m.total));
  return meses.map((m) => ({
    mes: m.mes,
    rotulo: mesAbreviado(m.mes),
    total: m.total,
    proporcao: maior === 0 ? 0 : m.total / maior,
  }));
}

type Pendencia = Dashboard['ultimasPendencias'][number];

export const TIPO_PENDENCIA: Record<Pendencia['tipo'], string> = {
  ADOCAO: 'Adoção',
  DOACAO_ANIMAL: 'Doação de animal',
  CANDIDATURA_VOLUNTARIO: 'Voluntariado',
};

/** Para onde a pendência leva (detalhe com as ações de aprovar/recusar). */
export function rotaPendencia(p: Pick<Pendencia, 'tipo' | 'id'>) {
  const params = { id: p.id };
  switch (p.tipo) {
    case 'ADOCAO':
      return { pathname: '/admin/adocoes/[id]', params } as const;
    case 'DOACAO_ANIMAL':
      return { pathname: '/admin/doacoes-animais/[id]', params } as const;
    case 'CANDIDATURA_VOLUNTARIO':
      return { pathname: '/admin/voluntarios/[id]', params } as const;
  }
}

/** Busca da lista de conversas (o protótipo tem "Buscar por nome"): sem acento e sem caixa. */
export function correspondeBusca(nome: string, busca: string): boolean {
  const normalizar = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
  return normalizar(nome).includes(normalizar(busca));
}

interface Endereco {
  readonly cep: string;
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string | null;
  readonly bairro: string;
  readonly cidade: string;
  readonly uf: string;
}

/** "Praça da Sé, 1 (ap. 2) – Sé, São Paulo/SP – CEP 01001-000" (detalhe do solicitante). */
export function enderecoEmLinha(e: Endereco): string {
  const rua = `${e.logradouro}, ${e.numero}${e.complemento ? ` (${e.complemento})` : ''}`;
  return `${rua} – ${e.bairro}, ${e.cidade}/${e.uf} – CEP ${mascararCep(e.cep)}`;
}

/** Códigos → rótulos na ordem das opções ("SEGUNDA","SEXTA" → "Seg, Sex"). */
export function rotulosEm<T extends string>(
  valores: readonly T[],
  opcoes: readonly { readonly valor: T; readonly rotulo: string }[],
): string {
  const lista = opcoes.filter((o) => valores.includes(o.valor)).map((o) => o.rotulo);
  return lista.length > 0 ? lista.join(', ') : '—';
}
