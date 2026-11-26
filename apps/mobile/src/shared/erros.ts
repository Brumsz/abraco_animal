/**
 * Mensagens de erro para a pessoa. A decisão é pelo `codigo` da API (estável),
 * nunca pelo texto; para códigos sem mensagem própria usa-se a da API.
 */
import { ErroApi, ErroRede } from '@abraco/api-client';

import { CONFIG } from '@/core/config';

const MENSAGENS: Record<string, string> = {
  CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos.',
  CONTA_DESATIVADA: 'Esta conta está desativada. Fale com a ONG pelo Instagram.',
  // A API não diz se foi o e-mail ou o CPF (evita descobrir quem tem conta).
  CADASTRO_DUPLICADO: 'Já existe uma conta com estes dados. Tente entrar ou recuperar a senha.',
  CODIGO_INVALIDO: 'Código incorreto ou expirado. Confira o e-mail ou peça um novo.',
  TOKEN_REDEFINICAO_INVALIDO: 'O prazo para trocar a senha acabou. Comece de novo.',
  ADOCAO_PENDENTE_EXISTENTE:
    'Você já tem um pedido de adoção em análise para este animal. Aguarde a resposta da equipe.',
  ANIMAL_NAO_DISPONIVEL: 'Este animal não está mais disponível para adoção.',
  JA_PADRINHO: 'Você já é padrinho deste animal. Obrigado!',
  ANIMAL_NAO_APADRINHAVEL: 'Este animal não está recebendo padrinhos no momento.',
  ULTIMO_ADMIN:
    'Você é a única pessoa da equipe com acesso de administração. Passe o acesso a outra pessoa antes de excluir a conta.',
  CONVERSA_ENCERRADA:
    'Esta conversa foi encerrada pela equipe. Envie uma nova mensagem para abrir outra.',
  CANDIDATURA_EM_ANALISE: 'Sua candidatura já está em análise. A equipe responde em breve.',
  JA_E_VOLUNTARIO: 'Você já é voluntário(a) da ONG. Obrigado!',
  JA_E_DA_EQUIPE: 'Você já faz parte da equipe da ONG.',
  PSP_INDISPONIVEL: 'O Pix está fora do ar agora. Tente de novo em alguns minutos.',
  // Painel da equipe
  ADOCAO_JA_ANALISADA: 'Outra pessoa da equipe já analisou este pedido. Atualize a tela.',
  ADOCAO_ALTERADA: 'Este pedido mudou enquanto você analisava. Atualize a tela.',
  DOACAO_ALTERADA: 'Esta doação mudou enquanto você analisava. Atualize a tela.',
  TRANSICAO_DOACAO_INVALIDA: 'Esta doação já mudou de etapa. Atualize a tela.',
  CANDIDATURA_JA_ANALISADA: 'Outra pessoa da equipe já analisou esta candidatura.',
  TRANSICAO_STATUS_INVALIDA: 'Adotado só pela aprovação de uma adoção. Escolha outro status.',
  ANIMAL_COM_ADOCOES_PENDENTES:
    'Este animal tem pedidos de adoção esperando análise. Analise os pedidos antes de remover.',
  LIMITE_FOTOS: 'Cada animal pode ter no máximo 10 fotos. Remova alguma antes de enviar mais.',
  IMAGEM_INVALIDA: 'Uma das fotos não é uma imagem válida (use JPG, PNG ou WebP de até 5 MB).',
  ACAO_NA_PROPRIA_CONTA: 'Você não pode alterar a sua própria conta por aqui.',
  ALVO_E_ADMIN: 'Contas da equipe (admin) não são alteradas pelo app.',
  AUTOAPROVACAO_PROIBIDA:
    'Você não pode analisar o seu próprio pedido. Peça a outra pessoa da equipe.',
};

export function mensagemDeErro(erro: unknown): string {
  // Em desenvolvimento, diz qual endereço o app tentou: "localhost" no celular é o
  // próprio celular, e isso é a causa mais comum (ver README, "Abrir o app no celular").
  if (erro instanceof ErroRede) {
    return __DEV__ ? `${erro.message} (API: ${CONFIG.apiUrl})` : erro.message;
  }
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
