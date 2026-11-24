import { ok, type DoacaoFinanceira } from '@abraco/api-client';
import {
  Button,
  cores,
  espaco,
  fontes,
  Input,
  raio,
  sombraSuave,
  Texto,
  useToast,
} from '@abraco/ui';
import * as Clipboard from 'expo-clipboard';
import { CheckCircleIcon, CopyIcon, HeartIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { novaChaveIdempotencia } from '@/core/armazenamento-seguro';
import { api } from '@/core/sessao';
import { useGerarPix, useStatusPix } from '@/features/pix/data/hooks';
import {
  centavosDoCampo,
  formatarContagem,
  formatarReais,
  paraTextoApi,
  problemaValor,
  VALORES_SUGERIDOS_CENTAVOS,
} from '@/features/pix/domain/valores';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { useEspacoBarra } from '@/shared/componentes/BarraNavegacao';
import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { mensagemDeErro } from '@/shared/erros';

import { QrCodePix } from './QrCodePix';

/** Protótipo "Doar - Pix": valor → QR real da API → confirmação automática. */
export default function TelaDoarPix() {
  const espacoBarra = useEspacoBarra();
  const [cobranca, setCobranca] = useState<DoacaoFinanceira | null>(null);

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: espacoBarra }}
        >
          <CabecalhoTela
            titulo="Doar com Pix"
            subtitulo="Cada valor ajuda a cuidar de quem não tem voz."
          />
          {cobranca ? (
            <Cobranca
              cobranca={cobranca}
              aoRecomecar={() => {
                setCobranca(null);
              }}
            />
          ) : (
            <EscolherValor aoGerar={setCobranca} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EscolherValor({ aoGerar }: { readonly aoGerar: (c: DoacaoFinanceira) => void }) {
  const gerar = useGerarPix();
  const [sugerido, setSugerido] = useState<number | 'outro'>(2500);
  const [outro, setOutro] = useState('');
  const [erroValor, setErroValor] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  // Uma chave por intenção de doar: o mesmo valor reaproveita a chave nos retries
  // (toque duplo ou rede instável nunca criam duas cobranças).
  const intencao = useRef<{ centavos: number; chave: string } | null>(null);

  const centavos = sugerido === 'outro' ? centavosDoCampo(outro) : sugerido;

  const enviar = () => {
    setErroGeral(null);
    const problema = problemaValor(centavos);
    setErroValor(problema);
    if (problema) return;
    if (intencao.current?.centavos !== centavos) {
      intencao.current = { centavos, chave: novaChaveIdempotencia() };
    }
    gerar.mutate(
      { valor: paraTextoApi(centavos), idempotencyKey: intencao.current.chave },
      {
        onSuccess: (c) => {
          intencao.current = null;
          aoGerar(c);
        },
        onError: (e) => {
          setErroGeral(mensagemDeErro(e));
        },
      },
    );
  };

  return (
    <View style={styles.secao}>
      <View
        style={styles.valores}
        accessibilityRole="radiogroup"
        accessibilityLabel="Valor da doação"
      >
        {VALORES_SUGERIDOS_CENTAVOS.map((v) => (
          <ChipValor
            key={v}
            rotulo={formatarReais(v, { curto: true })}
            selecionado={sugerido === v}
            aoTocar={() => {
              setSugerido(v);
              setErroValor(null);
            }}
          />
        ))}
        <ChipValor
          rotulo="Outro"
          selecionado={sugerido === 'outro'}
          aoTocar={() => {
            setSugerido('outro');
          }}
        />
      </View>

      {sugerido === 'outro' ? (
        <Input
          rotulo="Outro valor"
          value={outro === '' ? '' : formatarReais(centavosDoCampo(outro))}
          onChangeText={(t) => {
            setOutro(t);
            setErroValor(null);
          }}
          keyboardType="number-pad"
          placeholder="R$ 0,00"
          erro={erroValor ?? undefined}
          ajuda="Mínimo R$ 5,00"
        />
      ) : null}

      <AvisoErro mensagem={erroGeral} />

      <Button
        titulo={centavos > 0 ? `Gerar Pix de ${formatarReais(centavos)}` : 'Gerar Pix'}
        icone={<HeartIcon size={20} color={cores.branco} weight="fill" />}
        carregando={gerar.isPending}
        onPress={enviar}
        larguraTotal
      />
      <Nota />
    </View>
  );
}

function ChipValor({
  rotulo,
  selecionado,
  aoTocar,
}: {
  readonly rotulo: string;
  readonly selecionado: boolean;
  readonly aoTocar: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: selecionado }}
      onPress={aoTocar}
      style={[styles.chip, selecionado ? styles.chipSelecionado : null]}
    >
      <Texto
        variante="label"
        cor={selecionado ? cores.marcaEscura : cores.tinta}
        style={styles.textoChip}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {rotulo}
      </Texto>
    </Pressable>
  );
}

function Cobranca({
  cobranca,
  aoRecomecar,
}: {
  readonly cobranca: DoacaoFinanceira;
  readonly aoRecomecar: () => void;
}) {
  const toast = useToast();
  const expiraEm = new Date(cobranca.expiresAt);
  const status = useStatusPix(cobranca.id, expiraEm);
  const restante = useSegundosAte(expiraEm);
  const centavos = Math.round(Number(cobranca.valor) * 100);
  const situacao = status.data?.status ?? cobranca.status;

  if (situacao === 'CONFIRMADA') {
    return (
      <View style={[styles.secao, styles.final]} accessibilityLiveRegion="polite">
        <View style={[styles.iconeFinal, { backgroundColor: cores.sucessoFundo }]}>
          <CheckCircleIcon size={40} color={cores.sucessoTexto} weight="fill" />
        </View>
        <Texto variante="h1" alinhamento="center" accessibilityRole="header">
          Obrigado!
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo} alinhamento="center">
          Sua doação de {formatarReais(centavos)} foi confirmada. Ela vira ração, remédio e cuidado
          para os nossos resgatados.
        </Texto>
        <Button
          titulo="Fazer outra doação"
          variante="contorno"
          onPress={aoRecomecar}
          larguraTotal
        />
      </View>
    );
  }

  if (situacao === 'EXPIRADA' || restante <= 0) {
    return (
      <View style={[styles.secao, styles.final]}>
        <Texto variante="h2" alinhamento="center" accessibilityRole="header">
          Este Pix expirou
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo} alinhamento="center">
          Se você já pagou, a confirmação chega em instantes. Se não, gere um novo código.
        </Texto>
        <Button titulo="Gerar novo Pix" onPress={aoRecomecar} larguraTotal />
      </View>
    );
  }

  const copiar = async () => {
    await Clipboard.setStringAsync(cobranca.pixCopiaCola);
    toast.mostrar({ tipo: 'sucesso', mensagem: 'Código Pix copiado. Cole no app do seu banco.' });
  };

  return (
    <View style={styles.secao}>
      <View style={styles.cartaoQr}>
        <View
          style={styles.expira}
          accessible
          accessibilityLabel={`Expira em ${String(Math.ceil(restante / 60))} minutos`}
        >
          <View style={styles.pontoExpira} />
          <Texto variante="caption" cor={cores.marcaEscura} style={styles.textoExpira}>
            Expira em {formatarContagem(restante)}
          </Texto>
        </View>
        <View style={styles.molduraQr}>
          <QrCodePix texto={cobranca.pixCopiaCola} lado={198} />
        </View>
        <View style={styles.valor}>
          <Texto variante="h1" style={styles.textoValor}>
            {formatarReais(centavos)}
          </Texto>
          <Texto variante="label" cor={cores.tintaSuave} style={styles.textoOng}>
            ONG Abraço Animal
          </Texto>
        </View>
      </View>

      <View style={styles.copiaCola}>
        <Texto variante="body2" cor={cores.tintaSuave} numberOfLines={1} style={styles.codigo}>
          {cobranca.pixCopiaCola}
        </Texto>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copiar"
          onPress={() => void copiar()}
          style={({ pressed }) => [styles.copiarPequeno, { opacity: pressed ? 0.7 : 1 }]}
        >
          <CopyIcon size={16} color={cores.marcaEscura} />
          <Texto variante="label" cor={cores.marcaEscura}>
            Copiar
          </Texto>
        </Pressable>
      </View>

      <Button
        titulo="Copiar código Pix"
        icone={<CopyIcon size={20} color={cores.branco} />}
        onPress={() => void copiar()}
        larguraTotal
      />
      <Nota />
      {__DEV__ ? <SimularPagamento id={cobranca.id} aoPagar={() => void status.refetch()} /> : null}
      <Button titulo="Trocar o valor" variante="ghost" tamanho="sm" onPress={aoRecomecar} />
    </View>
  );
}

function Nota() {
  return (
    <View style={styles.nota}>
      <CheckCircleIcon size={16} color={cores.sucessoTexto} />
      <Texto variante="label" cor={cores.tintaCorpo} style={styles.textoNota}>
        A confirmação do pagamento é automática.
      </Texto>
    </View>
  );
}

/** Só em desenvolvimento com o Pix simulado: "o doador pagou". */
function SimularPagamento({ id, aoPagar }: { readonly id: string; readonly aoPagar: () => void }) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  return (
    <Button
      titulo="Simular pagamento (dev)"
      variante="secundario"
      tamanho="sm"
      carregando={enviando}
      onPress={() => {
        setEnviando(true);
        ok(api.POST('/v1/dev/pix/{id}/pagar', { params: { path: { id } } }))
          .then(aoPagar)
          .catch((e: unknown) => {
            toast.mostrar({ tipo: 'erro', mensagem: mensagemDeErro(e) });
          })
          .finally(() => {
            setEnviando(false);
          });
      }}
    />
  );
}

/** Segundos até `fim`, atualizado a cada segundo. */
function useSegundosAte(fim: Date): number {
  const calcular = () => Math.max(0, Math.floor((fim.getTime() - Date.now()) / 1000));
  const [segundos, setSegundos] = useState(calcular);
  const alvo = fim.getTime();
  useEffect(() => {
    const t = setInterval(() => {
      setSegundos(Math.max(0, Math.floor((alvo - Date.now()) / 1000)));
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, [alvo]);
  return segundos;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  secao: { paddingHorizontal: MARGEM_TELA, paddingTop: 18, gap: 14 },
  valores: { flexDirection: 'row', gap: espaco.sm },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.linhaForte,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipSelecionado: { borderWidth: 2, borderColor: cores.marca, backgroundColor: cores.marcaClara },
  textoChip: { fontFamily: fontes.interSemiBold, fontSize: 14 },
  cartaoQr: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderRadius: raio.xl,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    ...sombraSuave,
  },
  expira: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: 6,
    paddingHorizontal: espaco.md,
    borderRadius: raio.pilula,
    backgroundColor: cores.marcaClara,
  },
  pontoExpira: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.marca },
  textoExpira: { fontFamily: fontes.interSemiBold },
  molduraQr: {
    padding: 6,
    borderRadius: raio.botao,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.branco,
  },
  valor: { alignItems: 'center', gap: 2 },
  textoValor: { fontFamily: fontes.displayExtra, lineHeight: 32 },
  textoOng: { fontFamily: fontes.interRegular },
  copiaCola: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    height: 52,
    paddingLeft: espaco.lg,
    paddingRight: espaco.sm,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.linhaForte,
    backgroundColor: cores.superficie,
  },
  codigo: { flex: 1 },
  copiarPequeno: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: espaco.md,
    borderRadius: raio.sm,
    backgroundColor: cores.marcaClara,
  },
  nota: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco.sm },
  textoNota: { fontFamily: fontes.interRegular },
  final: { alignItems: 'center', paddingTop: espaco.xxl, gap: espaco.lg },
  iconeFinal: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
