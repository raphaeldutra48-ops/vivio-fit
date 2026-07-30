/**
 * Gera os ícones do app a partir do símbolo da marca.
 *
 *   node packages/ui/marca/gerar-icones.js
 *
 * O ícone adaptativo do Android é composto por camadas que o sistema recorta em
 * formatos diferentes (círculo, quadrado, gota) conforme o launcher. Só os 66%
 * centrais são garantidos — por isso o símbolo entra reduzido, com folga.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const AQUI = __dirname;
const ASSETS = path.join(AQUI, '..', '..', '..', 'apps', 'mobile', 'assets');

const MARCA = {
  verde: '#0F9D6D',
  azul: '#173B5E',
  acento: '#FF8C42',
  claro: '#FAFAFA',
};

const TRACADO = 'M 60 40 L 90 120 L 108 75 L 126 165 L 144 100 L 160 240 L 260 40';

/**
 * @param {object} opcoes
 * @param {string} opcoes.traco cor do traçado
 * @param {string} opcoes.pontos cor dos dois pontos de acento
 * @param {number} opcoes.escala 1 = símbolo ocupa a arte toda
 */
function simboloSvg({ traco, pontos, escala }) {
  const lado = 1024;
  // A arte original vive num quadrado de 320; centraliza e aplica a escala.
  const fator = (lado / 320) * escala;
  const deslocamento = (lado - 320 * fator) / 2;

  return Buffer.from(`<svg width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${deslocamento},${deslocamento}) scale(${fator})">
    <g transform="translate(10,6)">
      <path d="${TRACADO}" fill="none" stroke="${traco}" stroke-width="28"
            stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="108" cy="75" r="12" fill="${pontos}"/>
      <circle cx="160" cy="262" r="22" fill="${pontos}"/>
    </g>
  </g>
</svg>`);
}

const fundoGradiente = Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${MARCA.verde}"/>
      <stop offset="100%" stop-color="${MARCA.azul}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
</svg>`);

async function main() {
  if (!fs.existsSync(ASSETS)) throw new Error(`Pasta não encontrada: ${ASSETS}`);

  const saidas = [
    {
      arquivo: 'android-icon-background.png',
      svg: fundoGradiente,
      nota: 'fundo: o gradiente da marca',
    },
    {
      arquivo: 'android-icon-foreground.png',
      // 0.62: dentro da zona segura de 66%, com respiro para o recorte redondo.
      svg: simboloSvg({ traco: MARCA.claro, pontos: MARCA.acento, escala: 0.62 }),
      nota: 'frente: símbolo claro com acento',
    },
    {
      arquivo: 'android-icon-monochrome.png',
      // Tema dinâmico do Android 13+: o sistema recolore, então tudo em um tom.
      svg: simboloSvg({ traco: '#000000', pontos: '#000000', escala: 0.62 }),
      nota: 'monocromático: uma cor só, o sistema recolore',
    },
    {
      arquivo: 'splash-icon.png',
      svg: simboloSvg({ traco: MARCA.verde, pontos: MARCA.acento, escala: 0.7 }),
      nota: 'splash: sobre fundo do tema, sem moldura',
    },
  ];

  for (const { arquivo, svg, nota } of saidas) {
    const destino = path.join(ASSETS, arquivo);
    await sharp(svg).png().toFile(destino);
    console.log(`${arquivo.padEnd(32)} ${nota}`);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
