/**
 * Mock da Reanimated 4 para testes de componentes (Jest).
 *
 * Cobre só a API usada pelo app. Não carrega módulos nativos (worklets) nem
 * DOM, então o comportamento é idêntico no Windows e no Linux (CI). As
 * animações terminam instantaneamente: os testes verificam comportamento e
 * acessibilidade, não a animação em si.
 */
const React = require('react');
const RN = require('react-native');

const identidade = (v) => v;
const nada = () => undefined;

function useSharedValue(inicial) {
  const ref = React.useRef(null);
  if (ref.current === null) {
    const estado = { value: inicial };
    ref.current = {
      get value() {
        return estado.value;
      },
      set value(v) {
        estado.value = v;
      },
      get: () => estado.value,
      set: (v) => {
        estado.value = typeof v === 'function' ? v(estado.value) : v;
      },
    };
  }
  return ref.current;
}

function interpolate(x, entrada, saida, extrapolacao) {
  const n = entrada.length;
  if (n < 2) return saida[0];
  let i = 0;
  while (i < n - 2 && x > entrada[i + 1]) i += 1;
  const [e0, e1, s0, s1] = [entrada[i], entrada[i + 1], saida[i], saida[i + 1]];
  let t = e1 === e0 ? 0 : (x - e0) / (e1 - e0);
  if (extrapolacao === 'clamp') t = Math.min(1, Math.max(0, t));
  return s0 + (s1 - s0) * t;
}

/** Builder de animação de layout (FadeIn.duration(200)...) — devolve a si mesmo. */
function criarAnimacaoLayout() {
  const builder = {};
  for (const metodo of [
    'duration',
    'delay',
    'springify',
    'damping',
    'easing',
    'withCallback',
    'reduceMotion',
  ]) {
    builder[metodo] = () => builder;
  }
  return builder;
}

const componenteAnimado = (Componente) => Componente;

const Animated = {
  View: RN.View,
  Text: RN.Text,
  Image: RN.Image,
  ScrollView: RN.ScrollView,
  FlatList: RN.FlatList,
  createAnimatedComponent: componenteAnimado,
};

const animacoes = {};
for (const nome of [
  'FadeIn',
  'FadeOut',
  'FadeInUp',
  'FadeOutUp',
  'FadeInDown',
  'FadeOutDown',
  'SlideInDown',
  'SlideOutDown',
  'SlideInUp',
  'SlideOutUp',
]) {
  animacoes[nome] = criarAnimacaoLayout();
}

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  ...animacoes,
  useSharedValue,
  useAnimatedStyle: (fn) => fn(),
  useDerivedValue: (fn) => ({ value: fn(), get: fn }),
  useAnimatedScrollHandler: () => nada,
  useAnimatedRef: () => React.useRef(null),
  useReducedMotion: () => false,
  withTiming: identidade,
  withSpring: identidade,
  withDelay: (_atraso, v) => v,
  withRepeat: identidade,
  withSequence: (...v) => v[v.length - 1],
  cancelAnimation: nada,
  runOnJS: (fn) => fn,
  interpolate,
  interpolateColor: (_x, _entrada, saida) => saida[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: new Proxy({}, { get: () => () => identidade }),
};
