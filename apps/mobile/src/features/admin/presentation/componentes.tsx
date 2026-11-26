/** Peças comuns das telas da equipe: filtros, seções do detalhe e folhas de decisão. */
import {
  BottomSheet,
  Button,
  Chip,
  cores,
  espaco,
  Input,
  raio,
  sombraSuave,
  Texto,
} from '@abraco/ui';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CabecalhoTela, MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { estiloChips } from '@/shared/componentes/GrupoEscolha';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';

import { MOTIVO_RECUSA, problemaMotivoRecusa } from '../domain/painel';

/** Chips de status no topo das listas (um só selecionado). */
export function FiltrosStatus<T extends string | null>({
  filtros,
  valor,
  aoMudar,
  rotulo,
}: {
  readonly filtros: readonly { readonly valor: T; readonly rotulo: string }[];
  readonly valor: T;
  readonly aoMudar: (v: T) => void;
  readonly rotulo: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[estiloChips.linha, styles.filtros]}
      accessibilityRole="radiogroup"
      accessibilityLabel={rotulo}
    >
      {filtros.map((f) => (
        <Chip
          key={f.rotulo}
          rotulo={f.rotulo}
          selecionado={f.valor === valor}
          onPress={() => {
            aoMudar(f.valor);
          }}
        />
      ))}
    </ScrollView>
  );
}

/** Cartão branco com título (blocos do detalhe: "Solicitante", "Triagem"). */
export function Secao({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.secao}>
      <Texto variante="h3" accessibilityRole="header">
        {titulo}
      </Texto>
      {children}
    </View>
  );
}

/** Rótulo pequeno em cima, valor embaixo (lido junto pelo leitor de tela). */
export function Campo({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  return (
    <View style={styles.campo} accessible accessibilityLabel={`${rotulo}: ${valor}`}>
      <Texto variante="caption" cor={cores.tintaSuave}>
        {rotulo}
      </Texto>
      <Texto variante="body1" cor={cores.tinta}>
        {valor}
      </Texto>
    </View>
  );
}

/**
 * Esqueleto do detalhe: voltar, carregando/erro, conteúdo rolável e as ações
 * fixas no rodapé (só quando há o que decidir).
 */
export function TelaDetalhe({
  titulo,
  subtitulo,
  consulta,
  acoes,
  folhas,
  children,
}: {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly consulta: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  readonly acoes?: ReactNode;
  /** Folhas de confirmação (BottomSheet): fora da rolagem, por cima de tudo. */
  readonly folhas?: ReactNode;
  readonly children?: ReactNode;
}) {
  let corpo: ReactNode;
  if (consulta.isPending) {
    corpo = (
      <ActivityIndicator
        color={cores.marca}
        style={styles.carregando}
        accessibilityLabel="Carregando"
      />
    );
  } else if (consulta.isError) {
    corpo = <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  } else {
    corpo = children;
  }
  return (
    <>
      <TelaComVoltar rodape={consulta.isPending || consulta.isError ? undefined : acoes}>
        <ScrollView contentContainerStyle={styles.rolagem}>
          <CabecalhoTela titulo={titulo} {...(subtitulo ? { subtitulo } : {})} />
          <View style={styles.blocos}>{corpo}</View>
        </ScrollView>
      </TelaComVoltar>
      {folhas}
    </>
  );
}

/** Dois botões lado a lado no rodapé: recusar (contorno) e aprovar (principal). */
export function AcoesDecisao({
  rotuloAprovar,
  aoAprovar,
  aoRecusar,
  ocupado,
}: {
  readonly rotuloAprovar: string;
  readonly aoAprovar: () => void;
  readonly aoRecusar?: () => void;
  readonly ocupado: boolean;
}) {
  return (
    <View style={styles.acoes}>
      {aoRecusar ? (
        <Button
          titulo="Recusar"
          variante="contorno"
          onPress={aoRecusar}
          disabled={ocupado}
          style={styles.flex}
        />
      ) : null}
      <Button titulo={rotuloAprovar} onPress={aoAprovar} carregando={ocupado} style={styles.flex} />
    </View>
  );
}

/** Confirmação de uma ação que avisa a pessoa por e-mail (aprovar, receber). */
export function FolhaConfirmar({
  visivel,
  aoFechar,
  titulo,
  texto,
  rotuloAcao,
  carregando,
  aoConfirmar,
  children,
}: {
  readonly visivel: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  readonly texto: string;
  readonly rotuloAcao: string;
  readonly carregando: boolean;
  readonly aoConfirmar: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <BottomSheet
      visivel={visivel}
      aoFechar={aoFechar}
      titulo={titulo}
      rodape={
        <Button titulo={rotuloAcao} carregando={carregando} onPress={aoConfirmar} larguraTotal />
      }
    >
      <Texto variante="body1" cor={cores.tintaCorpo}>
        {texto}
      </Texto>
      {children}
    </BottomSheet>
  );
}

/** Recusa com motivo obrigatório (vai no e-mail para a pessoa). */
export function FolhaRecusar({
  visivel,
  aoFechar,
  titulo,
  texto,
  carregando,
  aoConfirmar,
}: {
  readonly visivel: boolean;
  readonly aoFechar: () => void;
  readonly titulo: string;
  readonly texto: string;
  readonly carregando: boolean;
  readonly aoConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const problema = problemaMotivoRecusa(motivo);

  return (
    <BottomSheet
      visivel={visivel}
      aoFechar={() => {
        // Fechou sem recusar: a próxima abertura começa limpa.
        setMotivo('');
        setTentou(false);
        aoFechar();
      }}
      titulo={titulo}
      rodape={
        <Button
          titulo="Recusar"
          variante="destrutivo"
          carregando={carregando}
          onPress={() => {
            setTentou(true);
            if (!problema) aoConfirmar(motivo.trim());
          }}
          larguraTotal
        />
      }
    >
      <Texto variante="body1" cor={cores.tintaCorpo}>
        {texto}
      </Texto>
      <Input
        rotulo="Motivo da recusa"
        value={motivo}
        onChangeText={setMotivo}
        multiline
        maxLength={MOTIVO_RECUSA.max}
        erro={tentou && problema ? problema : undefined}
        ajuda="A pessoa recebe este texto por e-mail. Seja gentil e claro."
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filtros: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.lg, paddingBottom: espaco.md },
  carregando: { marginVertical: espaco.xxl },
  rolagem: { paddingBottom: espaco.xl },
  blocos: { paddingHorizontal: MARGEM_TELA, paddingTop: espaco.xl, gap: espaco.lg },
  secao: {
    gap: espaco.md,
    padding: espaco.lg + espaco.xs,
    borderRadius: raio.xl - espaco.xs,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
    ...sombraSuave,
  },
  campo: { gap: espaco.xxs },
  acoes: { flexDirection: 'row', gap: espaco.md },
});
