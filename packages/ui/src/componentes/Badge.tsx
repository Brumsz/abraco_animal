import { StyleSheet, View } from 'react-native';

import { coresStatus, type StatusBadge } from '../tokens/cores';
import { espaco, raio } from '../tokens/layout';
import { Texto } from './Texto';

const ROTULOS: Record<StatusBadge, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
  EM_TRATAMENTO: 'Em tratamento',
  NEUTRO: '',
  DESTAQUE: '',
};

export interface BadgeProps {
  readonly status: StatusBadge;
  /** Texto próprio (obrigatório para NEUTRO e DESTAQUE). */
  readonly texto?: string;
  readonly testID?: string;
}

/** Selo de status — a cor nunca é a única pista: o texto sempre acompanha. */
export function Badge({ status, texto, testID }: BadgeProps) {
  const { fundo, texto: corTexto } = coresStatus[status];
  const rotulo = texto ?? ROTULOS[status];

  return (
    <View
      style={[styles.badge, { backgroundColor: fundo }]}
      accessibilityLabel={`Status: ${rotulo}`}
      testID={testID}
    >
      <Texto variante="caption" cor={corTexto} style={styles.texto} maxFontSizeMultiplier={1.5}>
        {rotulo}
      </Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: espaco.sm,
    paddingVertical: espaco.xxs,
    borderRadius: raio.pilula,
  },
  texto: { fontWeight: '600' },
});
