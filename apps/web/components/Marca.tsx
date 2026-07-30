import { marca } from '@vivio/ui';

/**
 * O símbolo: um "V" que também é um traçado de progressão, com dois pontos de
 * acento. Desenhado inline em vez de <img> por dois motivos — acompanha a cor
 * do tema sem baixar arquivo novo, e não pisca no carregamento.
 *
 * `id` existe porque o gradiente do SVG precisa de identificador único: dois
 * símbolos na mesma página com o mesmo id fazem o segundo herdar o primeiro.
 */
export function Simbolo({
  tamanho = 32,
  id = 'vivio',
  monocromatico,
}: {
  tamanho?: number;
  id?: string;
  /** Cor única em vez do gradiente — para fundo colorido ou impressão. */
  monocromatico?: string;
}) {
  const idGradiente = `grad-${id}`;
  const traco = monocromatico ?? `url(#${idGradiente})`;

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 320 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {!monocromatico && (
        <defs>
          <linearGradient id={idGradiente} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={marca.gradienteInicio} />
            <stop offset="100%" stopColor={marca.gradienteFim} />
          </linearGradient>
        </defs>
      )}
      <g transform="translate(10,6)">
        <path
          d="M 60 40 L 90 120 L 108 75 L 126 165 L 144 100 L 160 240 L 260 40"
          fill="none"
          stroke={traco}
          strokeWidth={28}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={108} cy={75} r={12} fill={monocromatico ?? marca.acento} />
        <circle cx={160} cy={262} r={22} fill={monocromatico ?? marca.acento} />
      </g>
    </svg>
  );
}

/**
 * Símbolo + nome. O nome usa a cor do tema (e não o grafite fixo da marca)
 * para continuar legível no tema escuro — trocar a cor do lettering é
 * previsto pela identidade; trocar a do símbolo, não.
 */
export function Marca({
  tamanho = 28,
  id = 'marca',
  descritivo,
}: {
  tamanho?: number;
  id?: string;
  /** Mostra "treino · nutrição · saúde" abaixo do nome. */
  descritivo?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-sm">
      <Simbolo tamanho={tamanho} id={id} />
      <span className="inline-flex flex-col leading-none">
        {/* Cores do tema, não as puras da logo: o verde e o laranja da marca
            reprovam em contraste sobre fundo claro (ver paresDeContraste). */}
        <span
          className="font-extrabold tracking-tight"
          style={{ fontSize: tamanho * 0.86, color: 'var(--vv-texto-primario)' }}
        >
          Vív<span style={{ color: 'var(--vv-marca-acento)' }}>i</span>o
          <span className="font-medium" style={{ color: 'var(--vv-marca-texto)' }}>
            {' '}
            Fit
          </span>
        </span>
        {descritivo && (
          <span
            className="mt-xs uppercase"
            style={{
              fontSize: Math.max(9, tamanho * 0.26),
              letterSpacing: '0.18em',
              color: 'var(--vv-texto-secundario)',
            }}
          >
            Treino · Nutrição · Saúde
          </span>
        )}
      </span>
    </span>
  );
}
