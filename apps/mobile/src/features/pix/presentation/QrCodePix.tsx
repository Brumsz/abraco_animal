import { cores } from '@abraco/ui';
import { create } from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * QR do Pix desenhado no app a partir do "copia e cola" que a API devolve
 * (o PSP não manda imagem confiável em todos os casos; o texto é a fonte da verdade).
 * Um único <Path> com todos os módulos: leve mesmo em aparelhos simples.
 */
export function caminhoQr(texto: string): { tamanho: number; d: string } {
  const { modules } = create(texto, { errorCorrectionLevel: 'M' });
  let d = '';
  for (let lin = 0; lin < modules.size; lin++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(lin, col)) d += `M${String(col)} ${String(lin)}h1v1h-1z`;
    }
  }
  return { tamanho: modules.size, d };
}

export function QrCodePix({ texto, lado }: { readonly texto: string; readonly lado: number }) {
  const { tamanho, d } = useMemo(() => caminhoQr(texto), [texto]);
  // Zona de silêncio de 2 módulos para leitura confiável pela câmera.
  const margem = 2;
  // Fundo branco no contêiner (não no SVG): a zona de silêncio fica clara em qualquer tema.
  return (
    <View
      style={{ backgroundColor: cores.branco }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code do Pix. Se não puder escanear, use o botão Copiar código Pix."
      testID="qr-pix"
    >
      <Svg
        width={lado}
        height={lado}
        viewBox={`${String(-margem)} ${String(-margem)} ${String(tamanho + margem * 2)} ${String(tamanho + margem * 2)}`}
      >
        <Path d={d} fill={cores.tinta} />
      </Svg>
    </View>
  );
}
