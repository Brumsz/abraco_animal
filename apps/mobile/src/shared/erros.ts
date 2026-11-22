/**
 * Mensagens de erro para a pessoa. A decisão é pelo `codigo` da API (estável),
 * nunca pelo texto; para códigos sem mensagem própria usa-se a da API.
 */
import { ErroApi, ErroRede } from '@abraco/api-client';

const MENSAGENS: Record<string, string> = {
  CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos.',
  CONTA_DESATIVADA: 'Esta conta está desativada. Fale com a ONG pelo Instagram.',
  // A API não diz se foi o e-mail ou o CPF (evita descobrir quem tem conta).
  CADASTRO_DUPLICADO: 'Já existe uma conta com estes dados. Tente entrar ou recuperar a senha.',
  CODIGO_INVALIDO: 'Código incorreto ou expirado. Confira o e-mail ou peça um novo.',
  TOKEN_REDEFINICAO_INVALIDO: 'O prazo para trocar a senha acabou. Comece de novo.',
};

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroRede) return erro.message;
  if (erro instanceof ErroApi) {
    if (erro.status === 429) {
      const minutos = erro.tentarEmSegundos ? Math.ceil(erro.tentarEmSegundos / 60) : null;
      return minutos
        ? `Muitas tentativas. Tente de novo em ${String(minutos)} min.`
        : 'Muitas tentativas. Aguarde um pouco e tente de novo.';
    }
    return MENSAGENS[erro.codigo] ?? erro.message;
  }
  return 'Algo deu errado. Tente de novo.';
}

/** Repassa os erros por campo da API para o formulário; devolve se aplicou algum. */
export function aplicarErrosDeCampo<C extends string>(
  erro: unknown,
  campos: readonly C[],
  definir: (campo: C, mensagem: string) => void,
): boolean {
  if (!(erro instanceof ErroApi)) return false;
  let aplicou = false;
  for (const campo of campos) {
    const mensagem = erro.doCampo(campo);
    if (mensagem) {
      definir(campo, mensagem);
      aplicou = true;
    }
  }
  return aplicou;
}
