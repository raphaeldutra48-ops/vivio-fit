import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ForcaDaFonte,
  MARCADORES,
  ROTULO_CLASSIFICACAO,
  ROTULO_FORCA,
  referenciaDe,
  type Faixa,
  type Fonte,
  type Marcador,
  type SexoBiologico,
} from '@vivio/contracts';
import { REGRAS } from '../src/modules/alertas/regras';

/**
 * Gera o dossiê de revisão clínica (pendência 21).
 *
 * O app classifica exame e dispara alerta a partir de duas tabelas escritas
 * por quem programou, não por quem tem registro no conselho. Antes do primeiro
 * paciente real, um médico e um nutricionista precisam percorrer as duas.
 *
 * O documento é GERADO das tabelas, nunca escrito à mão: um dossiê que diverge
 * do código faz o revisor aprovar uma coisa e o app executar outra — que é
 * exatamente o risco que ele deveria eliminar.
 *
 *   pnpm --filter @vivio/api revisao-clinica
 */

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function faixaTexto(faixa: Faixa, unidade: string): string {
  const u = unidade ? ` ${unidade}` : '';
  if (faixa.min !== undefined && faixa.max !== undefined) return `${faixa.min} a ${faixa.max}${u}`;
  if (faixa.max !== undefined) return `até ${faixa.max}${u}`;
  if (faixa.min !== undefined) return `a partir de ${faixa.min}${u}`;
  return '—';
}

/** Rende as duas faixas quando o marcador distingue sexo. */
function porSexo(
  faixa: Faixa | Record<SexoBiologico, Faixa>,
  unidade: string,
): string {
  if ('M' in faixa || 'F' in faixa) {
    const r = faixa as Record<SexoBiologico, Faixa>;
    return `H: ${faixaTexto(r.M, unidade)}<br>M: ${faixaTexto(r.F, unidade)}`;
  }
  return faixaTexto(faixa as Faixa, unidade);
}

const fonteTexto = (f: Fonte) =>
  [f.organizacao, f.documento, f.ano, f.pmid && `PMID ${f.pmid}`].filter(Boolean).join(' · ');

/** Marcadores cuja faixa LABORATORIAL — a que carimba "Crítico" — não vem de diretriz. */
const semDiretriz = MARCADORES.filter(
  (m) => referenciaDe(m).fonteLaboratorial.forca !== ForcaDaFonte.DIRETRIZ,
);

function linhaDeMarcador(m: Marcador): string {
  const r = referenciaDe(m);
  const atencao = semDiretriz.includes(m);

  return `
    <tr class="${atencao ? 'atencao' : ''}">
      <td>
        <strong>${escapar(r.rotulo)}</strong>
        ${r.unidade ? `<div class="unidade">${escapar(r.unidade)}</div>` : ''}
        ${atencao ? '<div class="selo">revisar com atenção</div>' : ''}
      </td>
      <td>
        ${porSexo(r.laboratorial, r.unidade)}
        <div class="fonte">${escapar(fonteTexto(r.fonteLaboratorial))}</div>
        <div class="forca">${escapar(ROTULO_FORCA[r.fonteLaboratorial.forca])}</div>
      </td>
      <td>
        ${porSexo(r.funcional, r.unidade)}
        <div class="fonte">${escapar(fonteTexto(r.fonteFuncional))}</div>
        <div class="forca">${escapar(ROTULO_FORCA[r.fonteFuncional.forca])}</div>
      </td>
      <td class="parecer"></td>
    </tr>
    ${r.nota ? `<tr class="nota ${atencao ? 'atencao' : ''}"><td colspan="4">${escapar(r.nota)}</td></tr>` : ''}
  `;
}

function blocoDeRegra(regra: (typeof REGRAS)[number]): string {
  const r = referenciaDe(regra.marcador);
  const lado =
    regra.lado === 'ABAIXO' ? 'abaixo do alvo' : regra.lado === 'ACIMA' ? 'acima do alvo' : 'em qualquer direção';

  return `
    <div class="regra">
      <div class="regra-cabeca">
        <strong>${escapar(r.rotulo)}</strong> — dispara quando está
        <em>${escapar(regra.quando.map((c) => ROTULO_CLASSIFICACAO[c]).join(' ou '))}</em>, ${escapar(lado)}
      </div>
      <table class="avisos">
        <thead><tr><th>Quem recebe</th><th>Texto que aparece para essa pessoa</th><th>Parecer</th></tr></thead>
        <tbody>
          ${regra.avisos
            .map(
              (a) => `
            <tr>
              <td class="papel">${escapar(a.papel)}</td>
              <td>
                <strong>${escapar(a.titulo)}</strong>
                <div>${escapar(a.orientacao)}</div>
              </td>
              <td class="parecer"></td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Vívio Fit — revisão clínica das faixas e alertas</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.45; color: #111; max-width: 190mm; margin: 0 auto; }
  h1 { font-size: 17pt; margin: 0 0 4px; }
  h2 { font-size: 13pt; margin: 26px 0 8px; border-bottom: 1.5px solid #111; padding-bottom: 3px; }
  .sub { color: #555; margin: 0 0 18px; }
  .aviso { border: 1.5px solid #111; padding: 10px 12px; margin: 14px 0 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #111; padding: 5px 6px; }
  td { border-bottom: 1px solid #ccc; padding: 6px; vertical-align: top; }
  .unidade, .fonte, .forca { font-size: 8.5pt; color: #555; }
  .forca { font-style: italic; }
  .parecer { width: 26%; background: #fafafa; }
  .nota td { font-size: 9pt; color: #444; border-bottom: 1px solid #ccc; padding-top: 0; }
  tr.atencao td { background: #fff8e5; }
  tr.nota.atencao td { background: #fff8e5; }
  .selo { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; border: 1px solid #8a6d00; color: #8a6d00; display: inline-block; padding: 1px 5px; margin-top: 3px; }
  .regra { border: 1px solid #bbb; padding: 10px 12px; margin-bottom: 14px; page-break-inside: avoid; }
  .regra-cabeca { margin-bottom: 8px; }
  .avisos th { font-size: 8.5pt; }
  .papel { font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  .assinaturas { margin-top: 36px; display: flex; gap: 40px; }
  .assinatura { flex: 1; border-top: 1px solid #111; padding-top: 5px; font-size: 9pt; }
  ol { padding-left: 18px; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>

<h1>Vívio Fit — revisão clínica</h1>
<p class="sub">Faixas de referência e regras de alerta · gerado em ${new Date().toLocaleDateString('pt-BR')} a partir do código em produção</p>

<div class="aviso">
  <strong>Por que este documento existe.</strong> O aplicativo classifica exames laboratoriais
  em <em>Ótimo</em>, <em>Atenção</em> e <em>Crítico</em>, e dispara orientações automáticas para
  os profissionais da equipe. As faixas e as regras abaixo foram compiladas das fontes citadas
  por quem desenvolveu o sistema — <strong>não por profissional habilitado</strong>. Antes do
  primeiro paciente real, elas precisam do seu parecer.
  <br><br>
  <strong>Como a classificação funciona.</strong> Nada é marcado como <em>Crítico</em> por causa
  da faixa funcional: só sair da faixa do laboratório produz esse selo. A faixa funcional apenas
  separa <em>Atenção</em> de <em>Ótimo</em> dentro do que o laudo já considera normal.
  <br><br>
  <strong>Como preencher.</strong> Na coluna Parecer, escreva <em>de acordo</em> ou o valor que
  deve substituir. Onde discordar do texto de um alerta, reescreva-o.
</div>

<h2>1. Onde olhar com mais atenção</h2>
<p>Estes ${semDiretriz.length} marcadores têm a faixa <strong>laboratorial</strong> — a que carimba
&ldquo;Crítico&rdquo; — vinda de fonte que não é diretriz de sociedade médica. São os de maior
risco de estarem errados:</p>
<ol>
  ${semDiretriz.map((m) => `<li><strong>${escapar(referenciaDe(m).rotulo)}</strong> — faixa do laudo baseada em ${escapar(ROTULO_FORCA[referenciaDe(m).fonteLaboratorial.forca].toLowerCase())}</li>`).join('')}
</ol>
<p>Duas decisões de projeto que também merecem confirmação:</p>
<ol>
  <li><strong>Taxa de filtração glomerular de 60 a 89</strong> é classificada como <em>Atenção</em>,
  e não <em>Crítico</em>, por ser G2 na KDIGO — redução leve, sem doença por si só.</li>
  <li><strong>LDL</strong> usa a faixa de risco cardiovascular baixo, porque o app ainda não
  estratifica risco. O alvo real muda conforme o paciente.</li>
</ol>

<h2>2. Faixas de referência — ${MARCADORES.length} marcadores</h2>
<table>
  <thead>
    <tr>
      <th style="width:22%">Marcador</th>
      <th style="width:26%">Faixa do laboratório<br><span style="font-weight:normal;text-transform:none">fora dela = Crítico</span></th>
      <th style="width:26%">Faixa funcional<br><span style="font-weight:normal;text-transform:none">fora dela = Atenção</span></th>
      <th>Parecer</th>
    </tr>
  </thead>
  <tbody>
    ${MARCADORES.map(linhaDeMarcador).join('')}
  </tbody>
</table>

<h2>3. Regras de alerta — ${REGRAS.length} regras</h2>
<p>Quando um achado dispara, o app envia orientações <strong>diferentes para cada profissional</strong>.
Quem não pode ver o marcador — o personal, sempre; o nutricionista, nos marcadores hormonais — recebe
o texto sem o nome do exame e sem o valor. Confirme se cada orientação é adequada e segura.</p>
${REGRAS.map(blocoDeRegra).join('')}

<h2>4. Parecer geral</h2>
<div style="border:1px solid #bbb; height:70px; margin-bottom:10px"></div>

<div class="assinaturas">
  <div class="assinatura">Médico(a) — nome, CRM e data</div>
  <div class="assinatura">Nutricionista — nome, CRN e data</div>
</div>

</body>
</html>
`;

const destino = resolve(process.cwd(), process.argv[2] ?? 'revisao-clinica.html');
writeFileSync(destino, html, 'utf8');
console.log(`Dossiê gerado: ${destino}`);
console.log(`${MARCADORES.length} marcadores, ${REGRAS.length} regras de alerta.`);
console.log(`${semDiretriz.length} marcadores marcados como "revisar com atenção".`);
