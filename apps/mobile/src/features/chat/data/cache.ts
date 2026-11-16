/**
 * Atualização do cache do chat pelos eventos do WebSocket (funções puras,
 * testáveis). As páginas vêm da API da mais nova para a mais antiga.
 */
import type { Mensagem } from '@abraco/api-client';
import type { InfiniteData } from '@tanstack/react-query';

export interface PaginaMensagens {
  itens: Mensagem[];
  proximoCursor: string | null;
}

type Dados = InfiniteData<PaginaMensagens, string | null>;

/** Mensagem nova entra no topo da 1ª página; repetida (REST + WebSocket) não duplica. */
export function incluirMensagem(dados: Dados | undefined, m: Mensagem): Dados | undefined {
  if (!dados) return dados;
  if (dados.pages.some((p) => p.itens.some((x) => x.id === m.id))) return dados;
  const [primeira, ...resto] = dados.pages;
  if (!primeira) return dados;
  return { ...dados, pages: [{ ...primeira, itens: [m, ...primeira.itens] }, ...resto] };
}

/**
 * "Visto": marca como lidas as mensagens do OUTRO lado (de quem não leu) da
 * mensagem informada para trás. `null` = a mensagem não está no cache (recarregar).
 */
export function marcarLidas(
  dados: Dados | undefined,
  ateMensagemId: string,
  leitorEhEquipe: boolean,
): Dados | null | undefined {
  if (!dados) return dados;
  const todas = dados.pages.flatMap((p) => p.itens);
  const indice = todas.findIndex((m) => m.id === ateMensagemId);
  if (indice < 0) return null;
  const alvo = new Set(
    todas
      .slice(indice)
      .filter((m) => !m.lida && m.autorEhEquipe !== leitorEhEquipe)
      .map((m) => m.id),
  );
  if (alvo.size === 0) return dados;
  const agora = new Date().toISOString();
  return {
    ...dados,
    pages: dados.pages.map((p) => ({
      ...p,
      itens: p.itens.map((m) => (alvo.has(m.id) ? { ...m, lida: true, lidaEm: agora } : m)),
    })),
  };
}
