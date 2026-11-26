/**
 * Payload do push → tela do app (seção 6: "validar payloads de push").
 * O payload nunca decide o endereço: só o TIPO escolhe uma rota de uma tabela
 * fixa. Qualquer coisa fora do formato abre a lista do sino.
 */
import { TIPOS_NOTIFICACAO, type TipoNotificacao } from '@abraco/shared';
import { z } from 'zod';

const esquemaPayload = z.object({
  notificacaoId: z.uuid(),
  tipo: z.enum(TIPOS_NOTIFICACAO),
  entidadeId: z.uuid().nullable().optional(),
});

export type PayloadPush = z.infer<typeof esquemaPayload>;

const ROTAS: Record<TipoNotificacao, string> = {
  ADOCAO_APROVADA: '/minhas-adocoes',
  ADOCAO_RECUSADA: '/minhas-adocoes',
  ADOCAO_ANIMAL_ADOTADO: '/minhas-adocoes',
  DOACAO_ANIMAL_ATUALIZADA: '/minhas-doacoes',
  DOACAO_FINANCEIRA_CONFIRMADA: '/minhas-doacoes',
  VOLUNTARIADO_ATUALIZADO: '/voluntariar',
  CHAT_NOVA_MENSAGEM: '/chat',
  GERAL: '/notificacoes',
};

export const ROTA_PADRAO = '/notificacoes';

export function lerPayload(dados: unknown): PayloadPush | null {
  const r = esquemaPayload.safeParse(dados);
  return r.success ? r.data : null;
}

export function rotaDoPush(dados: unknown): string {
  const p = lerPayload(dados);
  return p ? ROTAS[p.tipo] : ROTA_PADRAO;
}
