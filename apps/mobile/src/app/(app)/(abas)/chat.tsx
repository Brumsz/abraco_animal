import { useSessao } from '@/core/sessao';
import { TelaConversasEquipe } from '@/features/admin/presentation/TelasAtendimento';
import TelaChat from '@/features/chat/presentation/TelaChat';

/** Usuário conversa com a ONG; a equipe (admin) vê a lista de conversas. */
export default function Aba() {
  const ehAdmin = useSessao((s) => s.usuario?.role === 'ADMIN');
  return ehAdmin ? <TelaConversasEquipe /> : <TelaChat />;
}
