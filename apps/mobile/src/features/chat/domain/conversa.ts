/** Regras de tela do chat (usuário e equipe) — funções puras, testáveis. */
import type { Conversa, Mensagem } from '@abraco/api-client';

/** A API permite UMA conversa aberta por pessoa: é ela que a aba mostra. */
export function conversaAtual(conversas: readonly Conversa[] | undefined): Conversa | null {
  return conversas?.find((c) => c.status === 'ABERTA') ?? null;
}

/**
 * Mensagem mais nova do OUTRO lado ainda não lida (lista da mais nova para a mais
 * antiga). É até ela que o app avisa "li" — uma chamada só, não uma por mensagem.
 * `souEquipe`: quem lê é a ONG (admin) e o outro lado é o usuário.
 */
export function ultimaDoOutroLadoNaoLida(
  mensagens: readonly Mensagem[],
  souEquipe: boolean,
): string | null {
  const m = mensagens.find((x) => x.autorEhEquipe !== souEquipe);
  return m && !m.lida ? m.id : null;
}

/** Prévia na lista de conversas da equipe: "ONG: …" quando quem falou por último foi a equipe. */
export function previaConversa(c: Pick<Conversa, 'ultimaMensagem'>): string {
  const m = c.ultimaMensagem;
  if (!m) return 'Sem mensagens';
  return m.autorEhEquipe ? `ONG: ${m.conteudo}` : m.conteudo;
}

/** Texto sob a minha última mensagem: "Enviada · 10:42" ou "Vista". */
export function situacaoEnvio(m: Mensagem, hora: (iso: string) => string): string {
  return m.lida ? `Vista · ${hora(m.lidaEm ?? m.criadoEm)}` : `Enviada · ${hora(m.criadoEm)}`;
}

export const MENSAGEM_MAX = 2000;
