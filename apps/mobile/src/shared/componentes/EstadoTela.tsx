import { cores, EmptyState } from '@abraco/ui';
import { CloudSlashIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';

import { mensagemDeErro } from '@/shared/erros';

/** Falha ao carregar: mensagem clara e "Tentar de novo" (nunca tela branca). */
export function EstadoErro({
  erro,
  aoTentarDeNovo,
}: {
  readonly erro: unknown;
  readonly aoTentarDeNovo: () => void;
}) {
  return (
    <EmptyState
      ilustracao={<CloudSlashIcon size={48} color={cores.marca} />}
      titulo="Não deu para carregar"
      subtitulo={mensagemDeErro(erro)}
      acao={{ titulo: 'Tentar de novo', aoPressionar: aoTentarDeNovo }}
    />
  );
}

/** Lista vazia com ícone, título e (opcional) uma ação. */
export function EstadoVazio({
  icone,
  titulo,
  subtitulo,
  acao,
}: {
  readonly icone: ReactNode;
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly acao?: { readonly titulo: string; readonly aoPressionar: () => void };
}) {
  return (
    <EmptyState
      ilustracao={icone}
      titulo={titulo}
      {...(subtitulo ? { subtitulo } : {})}
      {...(acao ? { acao } : {})}
    />
  );
}
