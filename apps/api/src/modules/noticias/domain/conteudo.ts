/**
 * Conteúdo das notícias: Markdown, sanitizado no servidor (seção 6:
 * "sanitização de HTML em campos de texto rico").
 *
 * 1. TODO HTML é removido (parser de HTML de verdade, não regex): <script>,
 *    <img onerror>, <iframe>… somem; o texto em volta fica.
 * 2. Destinos de link/imagem só podem ser http(s), mailto, âncora (#) ou
 *    caminho relativo (/). `javascript:`, `data:`, `vbscript:` — inclusive
 *    disfarçados com entidades (`java&#115;cript:`) — viram "#".
 *
 * O app também renderiza o Markdown sem HTML (defesa em profundidade).
 */
import sanitizeHtml from 'sanitize-html';

const DESTINO_PERMITIDO = /^(https?:\/\/|mailto:|#|\/(?!\/))/i;

const destinoSeguro = (url: string): string => (DESTINO_PERMITIDO.test(url.trim()) ? url : '#');

/** Só as entidades que o sanitize-html gera ao escapar texto comum. */
const decodificarEscape = (texto: string) =>
  texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

export function sanitizarMarkdown(markdown: string): string {
  // allowedTags: [] remove as tags e mantém o texto. Scripts/estilos somem por inteiro.
  const semHtml = decodificarEscape(
    sanitizeHtml(markdown, {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: 'discard',
      nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object'],
    }),
  );
  return (
    semHtml
      // [texto](destino "título") e ![alt](destino). O destino pode ter um nível de
      // parênteses balanceados, como no Markdown: (javascript:alert(1)) é UM destino.
      .replace(
        /(!?\[[^\]]*\]\()\s*((?:[^()\s]|\([^()\s]*\))*)/g,
        (_m, inicio: string, url: string) => `${inicio}${destinoSeguro(url)}`,
      )
      // Definição de referência: [id]: destino
      .replace(
        /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm,
        (_m, inicio: string, url: string) => `${inicio}${destinoSeguro(url)}`,
      )
  );
}

/** "Cavalo Trovão é adotado!" → "cavalo-trovao-e-adotado" */
export function slugDe(titulo: string): string {
  const slug = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'noticia';
}

export const FORMATO_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
