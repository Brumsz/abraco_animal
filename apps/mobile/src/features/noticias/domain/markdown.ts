/**
 * Markdown das notícias → blocos para o React Native, sem biblioteca e SEM HTML
 * (a API já sanitiza; aqui é a segunda camada). Suporta o que o jornal usa:
 * títulos (#, ##, ###), parágrafos, listas (- * 1.), citações (>), **negrito**,
 * *itálico* / _itálico_ e [links](https://…). Imagens viram o texto alternativo.
 */

export type Trecho =
  | { readonly tipo: 'texto' | 'negrito' | 'italico'; readonly texto: string }
  | { readonly tipo: 'link'; readonly texto: string; readonly url: string | null };

export type Bloco =
  | { readonly tipo: 'titulo'; readonly nivel: 1 | 2 | 3; readonly trechos: Trecho[] }
  | { readonly tipo: 'paragrafo' | 'citacao'; readonly trechos: Trecho[] }
  | { readonly tipo: 'lista'; readonly ordenada: boolean; readonly itens: Trecho[][] };

/** Só abre fora do app o que é http(s) ou e-mail. */
export function urlSegura(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|!?\[[^\]]*\]\([^)\s]*\))/g;

export function lerTrechos(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let inicio = 0;
  for (const m of linha.matchAll(INLINE)) {
    const bruto = m[0];
    const pos = m.index;
    if (pos > inicio) trechos.push({ tipo: 'texto', texto: linha.slice(inicio, pos) });
    if (bruto.startsWith('**') || bruto.startsWith('__')) {
      trechos.push({ tipo: 'negrito', texto: bruto.slice(2, -2) });
    } else if (bruto.startsWith('[') || bruto.startsWith('![')) {
      const link = /^(!?)\[([^\]]*)\]\(([^)\s]*)\)$/.exec(bruto);
      const imagem = link?.[1] === '!';
      const texto = link?.[2] ?? '';
      if (imagem) {
        if (texto) trechos.push({ tipo: 'texto', texto });
      } else {
        trechos.push({ tipo: 'link', texto, url: urlSegura(link?.[3] ?? '') });
      }
    } else {
      trechos.push({ tipo: 'italico', texto: bruto.slice(1, -1) });
    }
    inicio = pos + bruto.length;
  }
  if (inicio < linha.length) trechos.push({ tipo: 'texto', texto: linha.slice(inicio) });
  return trechos;
}

const ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;

export function lerMarkdown(md: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  let citacao: string[] = [];
  // "as": o TS não vê as mudanças feitas por fechar() e estreitaria para null.
  let lista = null as { ordenada: boolean; itens: string[] } | null;

  const fechar = () => {
    if (paragrafo.length > 0) {
      blocos.push({ tipo: 'paragrafo', trechos: lerTrechos(paragrafo.join(' ')) });
      paragrafo = [];
    }
    if (citacao.length > 0) {
      blocos.push({ tipo: 'citacao', trechos: lerTrechos(citacao.join(' ')) });
      citacao = [];
    }
    if (lista) {
      blocos.push({
        tipo: 'lista',
        ordenada: lista.ordenada,
        itens: lista.itens.map((i) => lerTrechos(i)),
      });
      lista = null;
    }
  };

  for (const bruta of md.replace(/\r\n?/g, '\n').split('\n')) {
    const linha = bruta.trim();
    if (linha === '') {
      fechar();
      continue;
    }
    const titulo = /^(#{1,6})\s+(.*?)\s*#*$/.exec(linha);
    if (titulo) {
      fechar();
      const nivel = Math.min(titulo[1]?.length ?? 1, 3) as 1 | 2 | 3;
      blocos.push({ tipo: 'titulo', nivel, trechos: lerTrechos(titulo[2] ?? '') });
      continue;
    }
    const item = ITEM.exec(bruta);
    if (item) {
      const ordenada = item[1] !== undefined;
      if (lista?.ordenada !== ordenada) {
        fechar();
        lista = { ordenada, itens: [] };
      }
      lista.itens.push(item[2] ?? '');
      continue;
    }
    if (linha.startsWith('>')) {
      if (paragrafo.length > 0 || lista) fechar();
      citacao.push(linha.replace(/^>\s?/, ''));
      continue;
    }
    if (lista || citacao.length > 0) fechar();
    paragrafo.push(linha);
  }
  fechar();
  return blocos;
}
