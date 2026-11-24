import { useSessao } from '@/core/sessao';
import TelaChat from '@/features/chat/presentation/TelaChat';
import { EmConstrucao } from '@/shared/componentes/EmConstrucao';

// O atendimento da equipe (lista de conversas do admin) chega com as telas de admin.
export default function Aba() {
  const ehAdmin = useSessao((s) => s.usuario?.role === 'ADMIN');
  return ehAdmin ? <EmConstrucao titulo="Atendimento" /> : <TelaChat />;
}
