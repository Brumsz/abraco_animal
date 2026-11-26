import { cores, espaco, fontes, raio, Texto, useToast } from '@abraco/ui';
import { BellRingingIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { definirPreferenciaPush, preferenciaPush } from '@/core/preferencias';

import { desligarPush, ligarPush, permissaoPushConcedida } from '../data/push';

/** Configurações → Notificações: liga/desliga o push deste aparelho. */
export function AvisosNoCelular() {
  const toast = useToast();
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    void Promise.all([preferenciaPush(), permissaoPushConcedida()]).then(([p, permitido]) => {
      if (ativo) setLigado(p !== 'desligado' && permitido);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const alternar = async (valor: boolean) => {
    setOcupado(true);
    try {
      if (!valor) {
        await desligarPush().catch(() => undefined);
        await definirPreferenciaPush('desligado');
        setLigado(false);
        return;
      }
      const r = await ligarPush(true);
      if (r === 'ligado') {
        await definirPreferenciaPush('ligado');
        setLigado(true);
      } else if (r === 'negado') {
        toast.mostrar({
          tipo: 'info',
          mensagem: 'As notificações estão bloqueadas. Libere nas configurações do celular.',
        });
        void Linking.openSettings();
      } else {
        toast.mostrar({
          tipo: 'info',
          mensagem: 'Os avisos funcionam no app instalado (não no Expo Go nem no emulador).',
        });
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={styles.secao}>
      <Texto variante="caption" cor={cores.tintaSuave} style={styles.titulo}>
        NOTIFICAÇÕES
      </Texto>
      <View style={styles.cartao}>
        <BellRingingIcon size={22} color={cores.tintaCorpo} />
        <View style={styles.textos}>
          <Texto variante="body1" cor={cores.tinta} style={styles.rotulo}>
            Avisos no celular
          </Texto>
          <Texto variante="caption" cor={cores.tintaSuave}>
            Adoção, doações, voluntariado e respostas da ONG.
          </Texto>
        </View>
        <Switch
          accessibilityLabel="Avisos no celular"
          value={ligado ?? false}
          disabled={ligado === null || ocupado}
          onValueChange={(v) => void alternar(v)}
          trackColor={{ true: cores.marca, false: cores.linhaForte }}
          thumbColor={cores.branco}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  secao: { gap: espaco.sm },
  titulo: { paddingHorizontal: espaco.xs, letterSpacing: 0.6 },
  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    padding: espaco.lg,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
  textos: { flex: 1, gap: espaco.xxs },
  rotulo: { fontFamily: fontes.interMedium },
});
