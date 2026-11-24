import { zodResolver } from '@hookform/resolvers/zod';
import type { Candidatura } from '@abraco/api-client';
import { Button, Chip, cores, espaco, raio, SkeletonLoader, Texto } from '@abraco/ui';
import { CheckCircleIcon, HourglassIcon, UsersThreeIcon } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useSessao } from '@/core/sessao';
import { AvisoErro } from '@/shared/componentes/AvisoErro';
import { MARGEM_TELA } from '@/shared/componentes/CabecalhoTela';
import { CampoForm } from '@/shared/componentes/CampoForm';
import { EstadoErro } from '@/shared/componentes/EstadoTela';
import { estiloChips, GrupoEscolha } from '@/shared/componentes/GrupoEscolha';
import { TelaComVoltar } from '@/shared/componentes/TelaComVoltar';
import { TelaConcluido } from '@/shared/componentes/TelaConcluido';
import { TelaFormulario } from '@/shared/componentes/TelaFormulario';
import { aplicarErrosDeCampo, mensagemDeErro } from '@/shared/erros';
import { dataCurta } from '@/shared/tempo';

import { useCandidatar, useMinhaCandidatura } from '../data/hooks';
import {
  alternar,
  AREAS,
  corpoCandidatura,
  DIAS,
  esquemaVoluntariado,
  MOTIVACAO_MIN,
  TURNOS_OPCOES,
  type FormVoluntariado,
} from '../domain/esquema';

/** Protótipo "Voluntariar" (campos da API) e o andamento da candidatura. */
export default function TelaVoluntariar() {
  const role = useSessao((s) => s.usuario?.role);
  const minha = useMinhaCandidatura();
  const [enviada, setEnviada] = useState(false);
  const [refazer, setRefazer] = useState(false);

  if (enviada) {
    return (
      <TelaConcluido
        titulo="Candidatura enviada!"
        texto="Obrigado por querer ajudar. A equipe vai ler com carinho e responde por notificação."
      />
    );
  }
  if (minha.isPending) {
    return (
      <TelaComVoltar>
        <View style={styles.carregando} accessible accessibilityLabel="Carregando">
          <SkeletonLoader altura={160} raio={20} />
        </View>
      </TelaComVoltar>
    );
  }
  if (minha.isError) {
    return (
      <TelaComVoltar>
        <EstadoErro erro={minha.error} aoTentarDeNovo={() => void minha.refetch()} />
      </TelaComVoltar>
    );
  }

  const c = minha.data;
  if (role === 'ADMIN' || (role === 'VOLUNTARIO' && c?.status !== 'PENDENTE')) {
    return (
      <Situacao
        icone={<CheckCircleIcon size={40} color={cores.sucessoTexto} weight="fill" />}
        titulo="Você já faz parte da equipe"
        texto={
          c?.cargo
            ? `Seu papel na ONG: ${c.cargo}. Obrigado por cada hora dedicada!`
            : 'Obrigado por cada hora dedicada aos animais!'
        }
      />
    );
  }
  if (c?.status === 'PENDENTE') {
    return (
      <Situacao
        icone={<HourglassIcon size={40} color={cores.avisoTexto} weight="fill" />}
        titulo="Candidatura em análise"
        texto={`Enviada em ${dataCurta(c.criadoEm)}. A equipe responde por notificação.`}
        candidatura={c}
      />
    );
  }
  if (c?.status === 'RECUSADO' && !refazer) {
    return (
      <Situacao
        icone={<UsersThreeIcon size={40} color={cores.marca} />}
        titulo="Candidatura não aprovada"
        texto={c.motivoRecusa ?? 'Desta vez não foi possível. Você pode tentar de novo.'}
        acao={{
          titulo: 'Enviar nova candidatura',
          aoPressionar: () => {
            setRefazer(true);
          },
        }}
      />
    );
  }
  return (
    <Formulario
      aoEnviar={() => {
        setEnviada(true);
      }}
    />
  );
}

function Situacao({
  icone,
  titulo,
  texto,
  candidatura,
  acao,
}: {
  readonly icone: ReactNode;
  readonly titulo: string;
  readonly texto: string;
  readonly candidatura?: Candidatura;
  readonly acao?: { readonly titulo: string; readonly aoPressionar: () => void };
}) {
  return (
    <TelaComVoltar
      rodape={
        acao ? <Button titulo={acao.titulo} onPress={acao.aoPressionar} larguraTotal /> : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.situacao}>
        <View style={styles.icone}>{icone}</View>
        <Texto variante="titulo" accessibilityRole="header">
          {titulo}
        </Texto>
        <Texto variante="body1" cor={cores.tintaCorpo}>
          {texto}
        </Texto>
        {candidatura ? (
          <View style={styles.resumo}>
            <Linha
              rotulo="Áreas"
              valor={AREAS.filter((a) => candidatura.areasInteresse.includes(a.valor))
                .map((a) => a.rotulo)
                .join(', ')}
            />
            <Linha
              rotulo="Dias"
              valor={DIAS.filter((d) => candidatura.disponibilidadeDias.includes(d.valor))
                .map((d) => d.rotulo)
                .join(', ')}
            />
            <Linha
              rotulo="Turnos"
              valor={TURNOS_OPCOES.filter((t) => candidatura.turnos.includes(t.valor))
                .map((t) => t.rotulo)
                .join(', ')}
            />
          </View>
        ) : null}
      </ScrollView>
    </TelaComVoltar>
  );
}

function Linha({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  return (
    <View>
      <Texto variante="label" cor={cores.tintaSuave}>
        {rotulo}
      </Texto>
      <Texto variante="body1">{valor}</Texto>
    </View>
  );
}

function Formulario({ aoEnviar }: { readonly aoEnviar: () => void }) {
  const candidatar = useCandidatar();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormVoluntariado>({
    resolver: zodResolver(esquemaVoluntariado),
    defaultValues: {
      areasInteresse: [],
      areaInteresseOutros: '',
      disponibilidadeDias: [],
      turnos: [],
      motivacao: '',
      habilidades: '',
    },
    mode: 'onTouched',
  });
  const areas = useWatch({ control, name: 'areasInteresse' });

  const enviar = handleSubmit(async (f) => {
    setErroGeral(null);
    try {
      await candidatar.mutateAsync(corpoCandidatura(f));
      aoEnviar();
    } catch (erro) {
      const campos = [
        'areasInteresse',
        'areaInteresseOutros',
        'disponibilidadeDias',
        'turnos',
        'motivacao',
        'habilidades',
      ] as const;
      const aplicou = aplicarErrosDeCampo(erro, campos, (c, m) => {
        setError(c, { message: m });
      });
      if (!aplicou) setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <TelaFormulario
      titulo="Voluntariar"
      subtitulo="Você ama os animais e quer fazer a diferença? Conte como quer ajudar."
      rodape={
        <Button
          titulo="Enviar candidatura"
          carregando={candidatar.isPending}
          onPress={() => void enviar()}
          larguraTotal
        />
      }
    >
      <AvisoErro mensagem={erroGeral} />
      <Multipla
        control={control}
        nome="areasInteresse"
        rotulo="Como você quer ajudar?"
        opcoes={AREAS}
        erro={errors.areasInteresse?.message}
      />
      {areas.includes('OUTROS') ? (
        <CampoForm
          control={control}
          nome="areaInteresseOutros"
          rotulo="Qual outra área?"
          erro={errors.areaInteresseOutros?.message}
          maxLength={200}
        />
      ) : null}
      <Multipla
        control={control}
        nome="disponibilidadeDias"
        rotulo="Dias disponíveis"
        opcoes={DIAS}
        erro={errors.disponibilidadeDias?.message}
      />
      <Multipla
        control={control}
        nome="turnos"
        rotulo="Turnos"
        opcoes={TURNOS_OPCOES}
        erro={errors.turnos?.message}
      />
      <CampoForm
        control={control}
        nome="motivacao"
        rotulo="Por que você quer ser voluntário(a)?"
        ajuda={`Mínimo de ${String(MOTIVACAO_MIN)} caracteres.`}
        erro={errors.motivacao?.message}
        multiline
        maxLength={3000}
      />
      <CampoForm
        control={control}
        nome="habilidades"
        rotulo="Habilidades ou experiência (opcional)"
        placeholder="Ex.: lido com cavalos, dirijo caminhonete, sei fotografar."
        erro={errors.habilidades?.message}
        multiline
        maxLength={3000}
      />
    </TelaFormulario>
  );
}

type CampoMultiplo = 'areasInteresse' | 'disponibilidadeDias' | 'turnos';

function Multipla<N extends CampoMultiplo>({
  control,
  nome,
  rotulo,
  opcoes,
  erro,
}: {
  readonly control: Control<FormVoluntariado>;
  readonly nome: N;
  readonly rotulo: string;
  readonly opcoes: readonly { valor: FormVoluntariado[N][number]; rotulo: string }[];
  readonly erro: string | undefined;
}) {
  return (
    <Controller
      control={control}
      name={nome}
      render={({ field }) => {
        const marcados = field.value as FormVoluntariado[N][number][];
        return (
          <GrupoEscolha rotulo={rotulo} ajuda="Pode escolher mais de um." erro={erro} multipla>
            <View style={estiloChips.linha}>
              {opcoes.map((o) => (
                <Chip
                  key={o.valor}
                  rotulo={o.rotulo}
                  variante="opcao"
                  papel="checkbox"
                  selecionado={marcados.includes(o.valor)}
                  onPress={() => {
                    field.onChange(alternar(marcados, o.valor, opcoes));
                  }}
                />
              ))}
            </View>
          </GrupoEscolha>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  carregando: { padding: MARGEM_TELA },
  situacao: { paddingHorizontal: 28, paddingTop: 40, paddingBottom: espaco.xxl, gap: espaco.lg },
  icone: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.fundoSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumo: {
    gap: espaco.md,
    padding: espaco.lg,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.linha,
    backgroundColor: cores.superficie,
  },
});
