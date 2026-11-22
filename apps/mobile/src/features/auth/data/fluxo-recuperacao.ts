import { create } from 'zustand';

/**
 * Estado da recuperação de senha entre os 3 passos. Fica SÓ na memória (nem na
 * URL da rota, nem no disco): o token de redefinição vale como uma senha temporária.
 */
interface FluxoRecuperacao {
  email: string | null;
  tokenRedefinicao: string | null;
}

export const useFluxoRecuperacao = create<FluxoRecuperacao>(() => ({
  email: null,
  tokenRedefinicao: null,
}));

export const limparFluxoRecuperacao = () => {
  useFluxoRecuperacao.setState({ email: null, tokenRedefinicao: null });
};
