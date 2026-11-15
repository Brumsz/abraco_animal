/**
 * Conteúdo institucional: seções da página "Sobre a ONG" e FAQ. Texto simples
 * (sem HTML): o app mostra como texto, então não há como injetar script.
 */
import type { SecaoPerfilOng } from '@abraco/shared';
import { SECOES_PERFIL_ONG } from '@abraco/shared';

import type { EntradaAuditoria } from '../../../shared/aplicacao/auditoria.js';
import { ErroDominio, erroValidacao } from '../../../shared/dominio/erros.js';
import { exigirAdmin, type Ator } from '../../../shared/dominio/permissoes.js';

export const LIMITES_INSTITUCIONAL = {
  titulo: 120,
  conteudo: 20_000,
  pergunta: 200,
  resposta: 5_000,
} as const;

function texto(valor: string, campo: keyof typeof LIMITES_INSTITUCIONAL, rotulo: string): string {
  const limpo = valor.trim();
  if (limpo.length === 0)
    throw erroValidacao('CAMPO_OBRIGATORIO', `${rotulo} é obrigatório`, campo);
  if (limpo.length > LIMITES_INSTITUCIONAL[campo]) {
    throw erroValidacao('CAMPO_MUITO_LONGO', `${rotulo} longo demais`, campo);
  }
  return limpo;
}

// ── Portas ───────────────────────────────────────────────────────────────

export interface SecaoRegistro {
  readonly secao: SecaoPerfilOng;
  readonly titulo: string;
  readonly conteudo: string;
  readonly publicado: boolean;
  readonly atualizadoEm: Date;
}

export interface FaqRegistro {
  readonly id: number;
  readonly publicId: string;
  readonly pergunta: string;
  readonly resposta: string;
  readonly ordem: number;
  readonly publicado: boolean;
  readonly atualizadoEm: Date;
}

export interface DadosFaq {
  readonly pergunta: string;
  readonly resposta: string;
  readonly publicado: boolean;
}

/** Toda escrita grava a auditoria na mesma transação. */
export interface RepositorioInstitucional {
  listarSecoes(somentePublicadas: boolean): Promise<SecaoRegistro[]>;
  salvarSecao(
    d: { secao: SecaoPerfilOng; titulo: string; conteudo: string; publicado: boolean },
    auditoria: EntradaAuditoria,
  ): Promise<SecaoRegistro>;
  /** Em ordem crescente de `ordem`. */
  listarFaq(somentePublicadas: boolean): Promise<FaqRegistro[]>;
  buscarFaq(publicId: string): Promise<FaqRegistro | null>;
  /** Entra no fim da lista. */
  criarFaq(d: DadosFaq, auditoria: EntradaAuditoria): Promise<FaqRegistro>;
  atualizarFaq(faq: FaqRegistro, d: DadosFaq, auditoria: EntradaAuditoria): Promise<FaqRegistro>;
  removerFaq(faq: FaqRegistro, auditoria: EntradaAuditoria): Promise<void>;
  /** `ids` = TODAS as perguntas, na nova ordem. */
  reordenarFaq(ids: readonly string[], auditoria: EntradaAuditoria): Promise<void>;
}

interface Deps {
  readonly institucional: RepositorioInstitucional;
}

// ── Saídas ───────────────────────────────────────────────────────────────

const ordemSecao = (s: SecaoPerfilOng) => SECOES_PERFIL_ONG.indexOf(s);

const secaoSaida = (s: SecaoRegistro) => ({
  secao: s.secao,
  titulo: s.titulo,
  conteudo: s.conteudo,
  publicado: s.publicado,
  atualizadoEm: s.atualizadoEm,
});

const faqSaida = (f: FaqRegistro) => ({
  id: f.publicId,
  pergunta: f.pergunta,
  resposta: f.resposta,
  ordem: f.ordem,
  publicado: f.publicado,
});

const faqNaoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', 'FAQ_NAO_ENCONTRADA', 'Pergunta não encontrada');

function validarFaq(d: {
  pergunta: string;
  resposta: string;
  publicado?: boolean | undefined;
}): DadosFaq {
  return {
    pergunta: texto(d.pergunta, 'pergunta', 'Pergunta'),
    resposta: texto(d.resposta, 'resposta', 'Resposta'),
    publicado: d.publicado ?? true,
  };
}

// ── Público ──────────────────────────────────────────────────────────────

export class ObterPerfilOng {
  constructor(private readonly deps: Deps) {}

  async executar() {
    const secoes = await this.deps.institucional.listarSecoes(true);
    return secoes.sort((a, b) => ordemSecao(a.secao) - ordemSecao(b.secao)).map(secaoSaida);
  }
}

export class ListarFaq {
  constructor(private readonly deps: Deps) {}

  async executar() {
    return (await this.deps.institucional.listarFaq(true)).map(faqSaida);
  }
}

// ── Admin ────────────────────────────────────────────────────────────────

export class AdminListarSecoes {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }) {
    exigirAdmin(entrada.ator);
    const secoes = await this.deps.institucional.listarSecoes(false);
    return secoes.sort((a, b) => ordemSecao(a.secao) - ordemSecao(b.secao)).map(secaoSaida);
  }
}

export class EditarSecao {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    secao: SecaoPerfilOng;
    titulo: string;
    conteudo: string;
    publicado?: boolean | undefined;
  }) {
    exigirAdmin(entrada.ator);
    const s = await this.deps.institucional.salvarSecao(
      {
        secao: entrada.secao,
        titulo: texto(entrada.titulo, 'titulo', 'Título'),
        conteudo: texto(entrada.conteudo, 'conteudo', 'Conteúdo'),
        publicado: entrada.publicado ?? true,
      },
      {
        adminId: entrada.ator.id,
        acao: 'PERFIL_ONG_EDITADO',
        detalhe: { secao: entrada.secao, publicado: entrada.publicado ?? true },
      },
    );
    return secaoSaida(s);
  }
}

export class AdminListarFaq {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator }) {
    exigirAdmin(entrada.ator);
    return (await this.deps.institucional.listarFaq(false)).map(faqSaida);
  }
}

export class CriarFaq {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    pergunta: string;
    resposta: string;
    publicado?: boolean | undefined;
  }) {
    exigirAdmin(entrada.ator);
    const f = await this.deps.institucional.criarFaq(validarFaq(entrada), {
      adminId: entrada.ator.id,
      acao: 'FAQ_CRIADA',
    });
    return faqSaida(f);
  }
}

export class AtualizarFaq {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: {
    ator: Ator;
    id: string;
    pergunta: string;
    resposta: string;
    publicado?: boolean | undefined;
  }) {
    exigirAdmin(entrada.ator);
    const dados = validarFaq(entrada);
    const faq = await this.deps.institucional.buscarFaq(entrada.id);
    if (!faq) throw faqNaoEncontrada();
    const f = await this.deps.institucional.atualizarFaq(faq, dados, {
      adminId: entrada.ator.id,
      acao: 'FAQ_ATUALIZADA',
      detalhe: { publicado: dados.publicado },
    });
    return faqSaida(f);
  }
}

export class RemoverFaq {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; id: string }): Promise<void> {
    exigirAdmin(entrada.ator);
    const faq = await this.deps.institucional.buscarFaq(entrada.id);
    if (!faq) throw faqNaoEncontrada();
    await this.deps.institucional.removerFaq(faq, {
      adminId: entrada.ator.id,
      acao: 'FAQ_REMOVIDA',
      // A pergunta removida fica na auditoria (é conteúdo público, sem dado pessoal).
      detalhe: { pergunta: faq.pergunta },
    });
  }
}

export class ReordenarFaq {
  constructor(private readonly deps: Deps) {}

  async executar(entrada: { ator: Ator; ids: readonly string[] }): Promise<void> {
    exigirAdmin(entrada.ator);
    const atuais = new Set((await this.deps.institucional.listarFaq(false)).map((f) => f.publicId));
    const pedidos = new Set(entrada.ids);
    const mesmaLista =
      entrada.ids.length === atuais.size &&
      pedidos.size === atuais.size &&
      entrada.ids.every((id) => atuais.has(id));
    if (!mesmaLista) {
      throw erroValidacao(
        'REORDENACAO_INVALIDA',
        'Envie todas as perguntas do FAQ, cada uma uma única vez',
        'ids',
      );
    }
    await this.deps.institucional.reordenarFaq(entrada.ids, {
      adminId: entrada.ator.id,
      acao: 'FAQ_REORDENADA',
    });
  }
}
