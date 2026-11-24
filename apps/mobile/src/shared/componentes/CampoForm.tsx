import { Input } from '@abraco/ui';
import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { TextInputProps } from 'react-native';

/** Input do design system ligado ao react-hook-form (com máscara opcional). */
export function CampoForm<T extends FieldValues>({
  control,
  nome,
  erro,
  mascara,
  ...props
}: {
  control: Control<T>;
  nome: FieldPath<T>;
  erro: string | undefined;
  rotulo: string;
  mascara?: (t: string) => string;
  icone?: (cor: string) => ReactNode;
  senha?: boolean;
  rotuloOculto?: boolean;
  ajuda?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'>) {
  return (
    <Controller
      control={control}
      name={nome}
      render={({ field: { onChange, onBlur, value } }) => (
        <Input
          {...props}
          value={value}
          onChangeText={(t) => {
            onChange(mascara ? mascara(t) : t);
          }}
          onBlur={onBlur}
          erro={erro}
        />
      )}
    />
  );
}
