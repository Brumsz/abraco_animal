/**
 * TanStack Query: cache, retry e invalidação (seção 7 da spec).
 *
 * - Sem retry para erro 4xx (é regra de negócio ou dado inválido: repetir não resolve).
 * - Até 2 retries para falta de conexão e 1 para erro 5xx.
 * - Logout limpa TODO o cache (os dados da conta anterior não ficam na tela).
 */
import { ErroApi, ErroRede } from '@abraco/api-client';
import { QueryClient } from '@tanstack/react-query';

import { aoMudarSessao } from './sessao';

export function deveRepetir(tentativa: number, erro: unknown): boolean {
  if (erro instanceof ErroRede) return tentativa < 2;
  if (erro instanceof ErroApi) return erro.status >= 500 && tentativa < 1;
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: deveRepetir, staleTime: 30_000, gcTime: 5 * 60_000 },
    // Mutação nunca é repetida sozinha: poderia duplicar uma ação (a Idempotency-Key do Pix cobre o caso).
    mutations: { retry: false },
  },
});

aoMudarSessao((e) => {
  if (e === 'sessao-encerrada') queryClient.clear();
});

/** Chaves de cache centralizadas (invalidação previsível). */
export const chaves = {
  perfil: ['perfil'] as const,
  resumoConta: ['perfil', 'resumo'] as const,
  animais: (filtros: object) => ['animais', 'lista', filtros] as const,
  animal: (id: string) => ['animais', 'detalhe', id] as const,
  padrinhos: (id: string) => ['animais', 'padrinhos', id] as const,
  minhasAdocoes: ['adocoes', 'minhas'] as const,
  adocao: (id: string) => ['adocoes', 'detalhe', id] as const,
  minhasDoacoesAnimais: ['doacoes-animais', 'minhas'] as const,
  doacaoAnimal: (id: string) => ['doacoes-animais', 'detalhe', id] as const,
  statusPix: (id: string) => ['pix', 'status', id] as const,
  historicoPix: ['pix', 'historico'] as const,
  meusApadrinhamentos: ['apadrinhamentos', 'meus'] as const,
  minhaCandidatura: ['voluntariado', 'minha'] as const,
  perfilOng: ['institucional', 'perfil'] as const,
  faq: ['institucional', 'faq'] as const,
  posts: ['feed', 'lista'] as const,
  post: (id: string) => ['feed', 'detalhe', id] as const,
  noticias: ['noticias', 'lista'] as const,
  noticia: (slug: string) => ['noticias', 'detalhe', slug] as const,
  notificacoes: ['notificacoes', 'lista'] as const,
  naoLidas: ['notificacoes', 'nao-lidas'] as const,
  conversas: ['chat', 'conversas'] as const,
  mensagens: (conversaId: string) => ['chat', 'mensagens', conversaId] as const,
  // Painel da equipe. As conversas ficam sob ['chat', 'conversas'] para o tempo real
  // (useChatAoVivo) atualizar a lista do admin também.
  conversasEquipe: (status: string) => ['chat', 'conversas', 'equipe', status] as const,
  painel: ['admin', 'painel'] as const,
  adocoesEquipe: (status: string) => ['admin', 'adocoes', 'lista', status] as const,
  adocaoEquipe: (id: string) => ['admin', 'adocoes', 'detalhe', id] as const,
  doacoesEquipe: (status: string) => ['admin', 'doacoes-animais', 'lista', status] as const,
  doacaoEquipe: (id: string) => ['admin', 'doacoes-animais', 'detalhe', id] as const,
  voluntariosEquipe: (status: string) => ['admin', 'voluntarios', 'lista', status] as const,
  voluntarioEquipe: (id: string) => ['admin', 'voluntarios', 'detalhe', id] as const,
};
