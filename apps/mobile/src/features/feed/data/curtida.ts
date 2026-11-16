import type { Post } from '@abraco/api-client';

/** Atualização otimista da curtida (o coração muda na hora; desfaz se a API falhar). */
export function aplicarCurtida<T extends Pick<Post, 'curtidoPorMim' | 'totalCurtidas'>>(
  post: T,
  curtir: boolean,
): T {
  if (post.curtidoPorMim === curtir) return post;
  return {
    ...post,
    curtidoPorMim: curtir,
    totalCurtidas: Math.max(post.totalCurtidas + (curtir ? 1 : -1), 0),
  };
}
