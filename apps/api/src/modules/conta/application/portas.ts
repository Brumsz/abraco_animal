/**
 * "Minha conta" (seção 4 — Perfil e Configurações; LGPD art. 18): editar perfil,
 * trocar senha, resumo, exportar e excluir os próprios dados.
 */
import type { DadoCifrado, EnderecoUsuario } from '../../auth/application/portas.js';

export interface AlteracaoPerfil {
  readonly nome?: string;
  readonly telefone?: string;
  readonly endereco?: EnderecoUsuario;
}

export interface ResumoConta {
  /** Adoções aprovadas. */
  readonly adocoes: number;
  /** Pix confirmados + animais doados que chegaram à ONG. */
  readonly doacoes: number;
  /** Animais que a pessoa apadrinha hoje. */
  readonly apadrinhados: number;
}

/** Tudo o que a ONG guarda sobre a pessoa (dados cifrados ainda cifrados). */
export interface DadosBrutosExportacao {
  readonly cpf: DadoCifrado;
  readonly dataNasc: DadoCifrado;
  readonly aceitouTermosEm: Date;
  readonly consentimentoDadosEm: Date;
  readonly adocoes: Record<string, unknown>[];
  readonly doacoesAnimais: Record<string, unknown>[];
  readonly doacoesFinanceiras: Record<string, unknown>[];
  readonly apadrinhamentos: Record<string, unknown>[];
  readonly voluntariado: Record<string, unknown> | null;
  readonly mensagens: Record<string, unknown>[];
  readonly curtidas: number;
  readonly sessoes: Record<string, unknown>[];
}

/** Valores que substituem os dados pessoais na exclusão (LGPD: anonimização). */
export interface Anonimizacao {
  readonly email: string;
  readonly cpfHash: string;
  readonly senhaHash: string;
  readonly vazioCifrado: DadoCifrado;
  readonly agora: Date;
}

export interface RepositorioConta {
  atualizarPerfil(usuarioId: number, dados: AlteracaoPerfil): Promise<void>;
  resumo(usuarioId: number): Promise<ResumoConta>;
  dadosExportacao(usuarioId: number): Promise<DadosBrutosExportacao>;
  contarAdminsAtivos(): Promise<number>;
  /** Revoga as sessões do usuário menos a atual; devolve os sids revogados. */
  revogarOutrasSessoes(usuarioId: number, sidAtual: string): Promise<string[]>;
  /**
   * Numa transação: anonimiza o usuário, desvincula adoções/doações (o histórico
   * da ONG fica, sem nome), apaga o que só tem sentido com a pessoa (conversas,
   * curtidas, notificações, apadrinhamentos, candidatura, aparelhos de push) e
   * revoga todas as sessões. Devolve os sids revogados.
   */
  anonimizar(usuarioId: number, dados: Anonimizacao): Promise<string[]>;
}
