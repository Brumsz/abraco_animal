/** Regras de tela do chat do usuário (funções puras, testáveis). */
import type { Conversa, Mensagem } from '@abraco/api-client';

/** A API permite UMA conversa aberta por pessoa: é ela que a aba mostra. */
export function conversaAtual(conversas: readonly Conversa[] | undefined): Conversa | null {
  return conversas?.find((c) => c.status === 'ABERTA') ?? null;
}

/**
 * Mensagem mais nova da EQUIPE ainda não lida (lista da mais nova para a mais
 * antiga). É até ela que o app avisa "li" — uma chamada só, não uma por mensagem.
 */
export function ultimaDaEquipeNaoLida(mensagens: readonly Mensagem[]): string | null {
  const m = mensagens.find((x) => x.autorEhEquipe);
  return m && !m.lida ? m.id : null;
}

/** Texto sob a minha última mensagem: "Enviada · 10:42" ou "Vista". */
export function situacaoEnvio(m: Mensagem, hora: (iso: string) => string): string {
  return m.lida ? `Vista · ${hora(m.lidaEm ?? m.criadoEm)}` : `Enviada · ${hora(m.criadoEm)}`;
}

export const MENSAGEM_MAX = 2000;
