/** Tipo del preset de Tailwind compartido (ver `preset.cjs`). */
declare const preset: {
  theme: {
    screens: Record<string, string>;
    extend: Record<string, unknown>;
  };
};
export default preset;
