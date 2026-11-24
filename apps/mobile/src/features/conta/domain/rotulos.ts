/** Status dos pedidos da pessoa → texto e cor do badge (Minhas adoções / doações). */
import type { StatusBadge } from '@abraco/ui';
import type { StatusAdocao, StatusDoacaoAnimal, StatusDoacaoFinanceira } from '@abraco/shared';

interface Rotulo {
  readonly texto: string;
  readonly badge: StatusBadge;
}

export const STATUS_ADOCAO: Record<StatusAdocao, Rotulo> = {
  PENDENTE: { texto: 'Em análise', badge: 'PENDENTE' },
  APROVADA: { texto: 'Aprovada', badge: 'APROVADA' },
  RECUSADA: { texto: 'Não aprovada', badge: 'RECUSADA' },
};

export const STATUS_DOACAO_ANIMAL: Record<StatusDoacaoAnimal, Rotulo> = {
  PENDENTE: { texto: 'Em análise', badge: 'PENDENTE' },
  APROVADA: { texto: 'Aguardando retirada', badge: 'EM_TRATAMENTO' },
  RECUSADA: { texto: 'Não aceita', badge: 'RECUSADA' },
  RECEBIDA: { texto: 'Recebida pela ONG', badge: 'APROVADA' },
};

export const STATUS_PIX: Record<StatusDoacaoFinanceira, Rotulo> = {
  PENDENTE: { texto: 'Aguardando pagamento', badge: 'PENDENTE' },
  CONFIRMADA: { texto: 'Confirmada', badge: 'APROVADA' },
  EXPIRADA: { texto: 'Expirada', badge: 'NEUTRO' },
};
