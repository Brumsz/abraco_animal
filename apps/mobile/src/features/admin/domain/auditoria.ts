/** Log de auditoria: nomes das ações e filtros de período (funções puras). */

const ACOES: Record<string, string> = {
  ADOCAO_APROVADA: 'Aprovou uma adoção',
  ADOCAO_RECUSADA: 'Recusou uma adoção',
  ANIMAL_CRIADO: 'Cadastrou um animal',
  ANIMAL_ATUALIZADO: 'Editou um animal',
  ANIMAL_STATUS_ALTERADO: 'Mudou o status de um animal',
  ANIMAL_REMOVIDO: 'Removeu um animal',
  ANIMAL_FOTOS_ADICIONADAS: 'Enviou fotos de um animal',
  ANIMAL_FOTO_REMOVIDA: 'Removeu uma foto de animal',
  ANIMAL_FOTOS_REORDENADAS: 'Reordenou as fotos de um animal',
  DOACAO_ANIMAL_APROVADA: 'Aprovou uma doação de animal',
  DOACAO_ANIMAL_RECUSADA: 'Recusou uma doação de animal',
  DOACAO_ANIMAL_RECEBIDA: 'Recebeu um animal doado',
  VOLUNTARIO_APROVADO: 'Aprovou um voluntário',
  VOLUNTARIO_RECUSADO: 'Recusou um voluntário',
  CONVERSA_ASSUMIDA: 'Assumiu uma conversa',
  CONVERSA_ENCERRADA: 'Encerrou uma conversa',
  USUARIO_DESATIVADO: 'Desativou uma conta',
  USUARIO_REATIVADO: 'Reativou uma conta',
  USUARIO_ROLE_ALTERADA: 'Mudou o papel de uma conta',
  NOTICIA_CRIADA: 'Criou uma notícia',
  NOTICIA_EDITADA: 'Editou uma notícia',
  NOTICIA_REMOVIDA: 'Removeu uma notícia',
  NOTICIA_PUBLICADA: 'Publicou uma notícia',
  NOTICIA_DESPUBLICADA: 'Despublicou uma notícia',
  POST_CRIADO: 'Criou um post',
  POST_EDITADO: 'Editou um post',
  POST_REMOVIDO: 'Removeu um post',
  POST_PUBLICADO: 'Publicou um post',
  POST_DESPUBLICADO: 'Despublicou um post',
  PERFIL_ONG_EDITADO: 'Editou o perfil da ONG',
  FAQ_CRIADA: 'Criou uma pergunta do FAQ',
  FAQ_ATUALIZADA: 'Editou uma pergunta do FAQ',
  FAQ_REMOVIDA: 'Removeu uma pergunta do FAQ',
  FAQ_REORDENADA: 'Reordenou o FAQ',
};

/** Ação conhecida → frase; desconhecida (ação nova na API) → o código legível. */
export function rotuloAcao(acao: string): string {
  return ACOES[acao] ?? acao.toLowerCase().replaceAll('_', ' ');
}

export const PERIODOS = [
  { valor: '7', rotulo: '7 dias' },
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: 'tudo', rotulo: 'Tudo' },
] as const;

export type Periodo = (typeof PERIODOS)[number]['valor'];

/**
 * Período → início do filtro `de` (ISO com fuso). Arredonda para o início do dia
 * local: a chave do cache não muda a cada render e "7 dias" inclui hoje inteiro.
 */
export function inicioDoPeriodo(p: Periodo, agora: Date = new Date()): string | null {
  if (p === 'tudo') return null;
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  d.setDate(d.getDate() - Number(p) + 1);
  return d.toISOString();
}

/** Detalhe do registro (JSON livre) numa linha curta para a lista. */
export function resumoDetalhe(detalhe: unknown, max = 120): string | null {
  if (detalhe === null || detalhe === undefined) return null;
  if (typeof detalhe === 'object' && Object.keys(detalhe).length === 0) return null;
  const texto = JSON.stringify(detalhe)
    .replace(/[{}"]/g, '')
    .replace(/:/g, ': ')
    .replace(/,/g, ', ');
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}
