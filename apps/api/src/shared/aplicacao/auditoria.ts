/**
 * Registro de auditoria das ações administrativas. Os repositórios gravam a
 * entrada NA MESMA TRANSAÇÃO da alteração: ou as duas acontecem, ou nenhuma.
 *
 * `detalhe` nunca pode conter CPF, senha, token ou e-mail completo (seção 6).
 */
export interface EntradaAuditoria {
  /** publicId do admin (claim `sub`). */
  readonly adminId: string;
  readonly acao: AcaoAuditoria;
  readonly detalhe?: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

export type AcaoAuditoria =
  | 'ANIMAL_CRIADO'
  | 'ANIMAL_ATUALIZADO'
  | 'ANIMAL_STATUS_ALTERADO'
  | 'ANIMAL_REMOVIDO'
  | 'ANIMAL_FOTOS_ADICIONADAS'
  | 'ANIMAL_FOTO_REMOVIDA'
  | 'ANIMAL_FOTOS_REORDENADAS'
  | 'ADOCAO_APROVADA'
  | 'ADOCAO_RECUSADA'
  | 'DOACAO_ANIMAL_APROVADA'
  | 'DOACAO_ANIMAL_RECUSADA'
  | 'DOACAO_ANIMAL_RECEBIDA'
  | 'VOLUNTARIO_APROVADO'
  | 'VOLUNTARIO_RECUSADO'
  | 'PERFIL_ONG_EDITADO'
  | 'FAQ_CRIADA'
  | 'FAQ_ATUALIZADA'
  | 'FAQ_REMOVIDA'
  | 'FAQ_REORDENADA';
