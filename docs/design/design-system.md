# Design system — `packages/ui`

Implementa a seção 2 da spec. Antecipado (antes da Etapa 3) a pedido do usuário para que o app
pudesse ser visto no celular desde já.

## Tokens

- **Cores** (`tokens/cores.ts`): paleta oficial + tokens de acessibilidade abaixo.
- **Tipografia** (`tokens/tipografia.ts`): Poppins (H1 28 Bold, H2 22 SemiBold, H3 18 SemiBold) e
  Inter (Body1 16, Body2 14, Caption 12, Label 13 Medium). Escala com a fonte do sistema até 2x.
- **Layout** (`tokens/layout.ts`): espaçamentos, raios (cards 16), sombra suave (elevation 2) e
  alvo de toque mínimo de 44px.

## Decisão de contraste (WCAG AA)

A paleta original reprova em alguns pares de texto. Decisão do usuário: **manter o laranja da
marca e trocar a cor do texto**.

| Uso                          | Antes                    | Agora                              | Contraste |
| ---------------------------- | ------------------------ | ---------------------------------- | --------- |
| Texto do botão primário      | branco sobre `#F97316`   | `#431407` (marrom) sobre `#F97316` | 5,6:1 ✔   |
| Texto/link/borda laranja     | `#F97316` sobre claro    | `#C2410C` (`laranjaTexto`)         | 5,2:1 ✔   |
| Texto secundário sobre creme | `#6B7280`                | `#4B5563` (`neutro600`)            | 7,3:1 ✔   |
| Fundo do botão destrutivo    | `#EF4444` (branco 3,8:1) | `#DC2626` (`erroForte`)            | 4,8:1 ✔   |
| Borda do Input (WCAG 1.4.11) | `#E5E7EB` (1,2:1)        | `#6B7280`; foco `#C2410C`          | ≥ 3:1 ✔   |

O `#F97316` continua em fundos de botão, splash, gradientes, ícones e destaques.

## Componentes

| Componente       | Destaques                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `Texto`          | variantes tipográficas; h1–h3 anunciados como cabeçalho                                   |
| `Button`         | primario, secundario, ghost, destrutivo · sm/md/lg · carregando · micro-animação de toque |
| `Card`           | raio 16, sombra suave; tocável com rótulo acessível                                       |
| `Input`          | label flutuante animada, estados padrão/foco/erro/desabilitado, senha com mostrar/ocultar |
| `Badge`          | PENDENTE, APROVADA, RECUSADA, EM_TRATAMENTO — sempre com texto, não só cor                |
| `Avatar`         | foto circular com fallback em iniciais                                                    |
| `BottomSheet`    | modal inferior; fecha por X, voltar do Android ou toque fora                              |
| `Toast`          | `ToastProvider` + `useToast()`; sucesso/erro/info; anunciado por leitores de tela         |
| `SkeletonLoader` | pulso de carregamento                                                                     |
| `EmptyState`     | ilustração + título + subtítulo + ação opcional                                           |

Todas as animações respeitam a opção **"reduzir movimento"** do sistema.

## Versões e notas técnicas

- Expo SDK **58** (Expo Router 58, React Native 0.88, React 19.3, Reanimated 4.7).
- Ícones: **Phosphor** (tem ícone de cavalo; a Lucide não tem). Nomes com sufixo `Icon` (v3).
- Shared values usam `.get()`/`.set()` (compatível com o React Compiler).
- Testes com Jest (`jest-expo`) + React Native Testing Library 14 (API assíncrona: `await render`).
- Algumas bibliotecas do Expo estão um patch atrás do mais recente porque o lote novo foi
  publicado no mesmo dia; a regra de 3 dias de maturidade escolheu a versão anterior.

## Provisório (aguardando material da ONG)

- **Logo**: coração + nome em Poppins (`apps/mobile/src/shared/componentes/Logo.tsx`).
- **Ícone e splash**: coração creme sobre laranja (`apps/mobile/assets/`).
- **Fotos do onboarding**: ilustrações com gradiente e ícone; a spec pede uma foto de cavalo no
  slide 1. Fotos devem vir em 4:3.
