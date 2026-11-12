/**
 * Erros de domínio/aplicação. Não conhecem HTTP: a camada http traduz o
 * `tipo` para o status (shared/http/tratador-erros.ts).
 */
export type TipoErro =
  | 'VALIDACAO'
  | 'NAO_AUTENTICADO'
  | 'PROIBIDO'
  | 'NAO_ENCONTRADO'
  | 'CONFLITO'
  | 'REGRA_NEGOCIO'
  | 'LIMITE_EXCEDIDO';

export class ErroDominio extends Error {
  constructor(
    readonly tipo: TipoErro,
    /** Código estável consumido pelo app (ex.: CREDENCIAIS_INVALIDAS). */
    readonly codigo: string,
    mensagem: string,
    /** Campo do formulário relacionado, quando houver. */
    readonly campo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}

export const erroValidacao = (codigo: string, mensagem: string, campo?: string) =>
  new ErroDominio('VALIDACAO', codigo, mensagem, campo);
