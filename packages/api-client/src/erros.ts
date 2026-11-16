/**
 * Erros da API no formato RFC 9457 (application/problem+json). O app decide a
 * mensagem pelo `codigo` (estável), nunca pelo texto.
 */
export interface ErroCampo {
  readonly campo: string;
  readonly mensagem: string;
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    /** Ex.: CREDENCIAIS_INVALIDAS, ANIMAL_NAO_DISPONIVEL, LIMITE_EXCEDIDO. */
    readonly codigo: string,
    mensagem: string,
    readonly erros: readonly ErroCampo[] = [],
    /** Segundos do cabeçalho Retry-After (429). */
    readonly tentarEmSegundos?: number,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }

  /** Mensagem do campo do formulário, se a API apontou um. */
  doCampo(campo: string): string | undefined {
    return this.erros.find((e) => e.campo === campo)?.mensagem;
  }
}

/** Sem resposta (sem internet, servidor fora do ar, tempo esgotado). */
export class ErroRede extends Error {
  constructor(readonly causa: unknown) {
    super('Não foi possível falar com o servidor. Verifique sua conexão.');
    this.name = 'ErroRede';
  }
}

interface Problema {
  codigo?: unknown;
  detail?: unknown;
  title?: unknown;
  erros?: unknown;
}

const ehErroCampo = (x: unknown): x is ErroCampo =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as ErroCampo).campo === 'string' &&
  typeof (x as ErroCampo).mensagem === 'string';

export function erroDaResposta(resposta: Response, corpo: unknown): ErroApi {
  const p: Problema = typeof corpo === 'object' && corpo !== null ? corpo : {};
  const retry = Number(resposta.headers.get('retry-after'));
  return new ErroApi(
    resposta.status,
    typeof p.codigo === 'string' ? p.codigo : `HTTP_${String(resposta.status)}`,
    typeof p.detail === 'string'
      ? p.detail
      : typeof p.title === 'string'
        ? p.title
        : 'Algo deu errado. Tente novamente.',
    Array.isArray(p.erros) ? p.erros.filter(ehErroCampo) : [],
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}
