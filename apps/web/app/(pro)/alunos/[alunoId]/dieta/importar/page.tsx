'use client';

import {
  LIMITES_MIDIA,
  TipoMidia,
  type AlimentoCandidato,
  type LeituraDeDieta,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../../../../components/ui';
import { sdk } from '../../../../../../lib/sdk';

/**
 * Conferência da dieta lida do papel.
 *
 * A tela existe porque a leitura automática **não** vira prescrição sozinha.
 * O que a IA entrega é um rascunho; aqui a pessoa confere linha a linha contra
 * o documento e corrige. Só depois disso o plano é salvo, pelo mesmo caminho de
 * sempre — quem assina a prescrição é a profissional, não o programa.
 *
 * Dois campos governam a tela:
 *
 * `textoOriginal` fica visível em toda linha. É a frase como está no papel, e é
 * o que se compara com o documento — mais confiável do que qualquer marcador de
 * confiança que o modelo pudesse dar sobre si mesmo.
 *
 * `alimentoIdSugerido` nulo obriga escolha. Acontece quando o casamento ficou
 * fraco ou quando dois alimentos empataram — "azeite" serve para oliva e para
 * dendê. Nesses casos o campo vem vazio de propósito: uma sugestão duvidosa já
 * marcada é aceita sem olhar.
 */

type Escolhas = Record<string, { alimentoId: string | null; quantidadeG: string }>;

/** Chave estável por item: refeição + posição. A leitura não traz ids. */
const chaveDoItem = (r: number, i: number) => `${r}:${i}`;

export default function ImportarDieta() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const router = useRouter();

  const [leitura, setLeitura] = useState<LeituraDeDieta | null>(null);
  const [escolhas, setEscolhas] = useState<Escolhas>({});
  const [nome, setNome] = useState('');
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const limite = LIMITES_MIDIA[TipoMidia.MATERIAL];

  async function enviar(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!arquivo) return;

    const aceitos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!aceitos.includes(arquivo.type)) {
      setErro('Envie o PDF da dieta ou uma foto dela (JPG, PNG ou WebP).');
      return;
    }
    if (arquivo.size > limite.tamanhoMaximoBytes) {
      setErro(`Arquivo maior que ${Math.round(limite.tamanhoMaximoBytes / 1024 / 1024)} MB.`);
      return;
    }

    setLendo(true);
    setErro(null);
    try {
      const autorizacao = await sdk.midia.autorizarUpload({
        tipo: TipoMidia.MATERIAL,
        mimeType: arquivo.type,
        tamanhoBytes: arquivo.size,
      });
      await sdk.midia.enviarArquivo(autorizacao, arquivo);

      const lida = await sdk.exercicios.importarDieta({
        chave: autorizacao.chave,
        mimeType: arquivo.type as 'application/pdf',
        alunoId,
      });

      setLeitura(lida);
      setNome(lida.nome);
      /*
        A sugestão entra pré-preenchida; a ausência dela entra vazia. É a mesma
        distinção do servidor, e ela precisa sobreviver até a tela — se aqui
        escolhêssemos "o primeiro candidato" para não deixar campo vazio,
        anularíamos a decisão de não sugerir.
      */
      const iniciais: Escolhas = {};
      lida.refeicoes.forEach((r, ri) =>
        r.itens.forEach((item, ii) => {
          iniciais[chaveDoItem(ri, ii)] = {
            alimentoId: item.alimentoIdSugerido,
            quantidadeG: item.quantidadeG === null ? '' : String(item.quantidadeG),
          };
        }),
      );
      setEscolhas(iniciais);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setLendo(false);
    }
  }

  function alterar(chave: string, mudanca: Partial<Escolhas[string]>) {
    setEscolhas((atual) => ({ ...atual, [chave]: { ...atual[chave]!, ...mudanca } }));
  }

  const pendencias = leitura
    ? leitura.refeicoes.flatMap((r, ri) =>
        r.itens.map((_, ii) => escolhas[chaveDoItem(ri, ii)]).filter(
          (e) => !e || e.alimentoId === null || !e.quantidadeG || Number(e.quantidadeG) <= 0,
        ),
      ).length
    : 0;

  const podeSalvar = leitura !== null && pendencias === 0 && nome.trim().length >= 2 && !salvando;

  async function salvar(ativar: boolean) {
    if (!leitura || !podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      await sdk.dietas.criar(alunoId, {
        nome: nome.trim(),
        ativar,
        kcalAlvo: leitura.kcalAlvo ?? undefined,
        proteinaAlvoG: leitura.proteinaAlvoG ?? undefined,
        carboAlvoG: leitura.carboAlvoG ?? undefined,
        gorduraAlvoG: leitura.gorduraAlvoG ?? undefined,
        refeicoes: leitura.refeicoes.map((r, ri) => ({
          nome: r.nome,
          horarioSugerido: r.horarioSugerido ?? undefined,
          itens: r.itens.map((_, ii) => {
            const e = escolhas[chaveDoItem(ri, ii)]!;
            return { alimentoId: e.alimentoId!, quantidadeG: Number(e.quantidadeG) };
          }),
        })),
      });
      router.push(`/alunos/${alunoId}`);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <Link href={`/alunos/${alunoId}`} className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          ← Voltar para a ficha
        </Link>
        <h1 className="mt-md text-2xl font-bold">Importar dieta de um documento</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Envie o PDF ou a foto da folha. A leitura vira um rascunho que você confere antes de
          salvar — nada é prescrito sem a sua conferência.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <input
        ref={inputArquivo}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => void enviar(e)}
        className="hidden"
        aria-hidden
      />

      {!leitura && (
        <Cartao>
          <p className="font-semibold">Documento da dieta</p>
          <p className="mt-xs text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            PDF do plano ou foto da folha, inclusive manuscrita. A leitura leva cerca de meio
            minuto.
          </p>
          <div className="mt-lg">
            <Botao disabled={lendo} onClick={() => inputArquivo.current?.click()}>
              {lendo ? 'Lendo o documento…' : '📄 Escolher arquivo'}
            </Botao>
          </div>
          {/*
            O aluno precisa ter autorizado a leitura automática — é dado de
            saúde saindo para um serviço de fora. Dizer isso antes do erro
            poupa a pessoa de descobrir depois de esperar a leitura.
          */}
          <p className="mt-lg text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
            O documento é enviado a um serviço de leitura automática fora do Brasil. Só funciona se
            o aluno tiver autorizado isso no aplicativo, em <strong>Minha equipe</strong>.
          </p>
        </Cartao>
      )}

      {leitura && (
        <>
          {leitura.avisos.length > 0 && (
            <Aviso tipo="info">
              <p className="font-semibold">O que a leitura não conseguiu garantir</p>
              <ul className="mt-xs list-disc pl-lg">
                {leitura.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Aviso>
          )}

          <Cartao>
            <Campo rotulo="Nome do plano" value={nome} onChange={(e) => setNome(e.target.value)} />
            {(leitura.kcalAlvo !== null || leitura.proteinaAlvoG !== null) && (
              <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Metas lidas no documento:{' '}
                {[
                  leitura.kcalAlvo !== null && `${leitura.kcalAlvo} kcal`,
                  leitura.proteinaAlvoG !== null && `${leitura.proteinaAlvoG} g de proteína`,
                  leitura.carboAlvoG !== null && `${leitura.carboAlvoG} g de carboidrato`,
                  leitura.gorduraAlvoG !== null && `${leitura.gorduraAlvoG} g de gordura`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </Cartao>

          {leitura.refeicoes.map((refeicao, ri) => (
            <Cartao key={`${refeicao.nome}-${ri}`}>
              <h2 className="mb-md text-lg font-semibold">
                {refeicao.nome}
                {refeicao.horarioSugerido && (
                  <span className="font-normal" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {' '}
                    · {refeicao.horarioSugerido}
                  </span>
                )}
              </h2>

              <ul className="flex flex-col gap-lg">
                {refeicao.itens.map((item, ii) => {
                  const chave = chaveDoItem(ri, ii);
                  const escolha = escolhas[chave]!;
                  const escolhido = item.candidatos.find((c) => c.id === escolha.alimentoId);

                  return (
                    <li key={chave} className="border-t pt-md" style={{ borderColor: 'var(--vv-borda)' }}>
                      {/*
                        A linha do papel vem primeiro e em destaque: é contra ela
                        que se confere, não contra o nome que o modelo entendeu.
                      */}
                      <p className="text-sm">
                        <span style={{ color: 'var(--vv-texto-secundario)' }}>No documento: </span>
                        <strong>{item.textoOriginal}</strong>
                      </p>

                      <div className="mt-md grid gap-md sm:grid-cols-[2fr_1fr]">
                        <label className="flex flex-col gap-xs">
                          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                            Alimento do catálogo
                          </span>
                          <select
                            className="min-h-toque rounded-md border px-md"
                            style={{
                              background: 'var(--vv-superficie)',
                              borderColor:
                                escolha.alimentoId === null ? 'var(--vv-erro)' : 'var(--vv-borda)',
                              color: 'var(--vv-texto-primario)',
                            }}
                            value={escolha.alimentoId ?? ''}
                            onChange={(e) =>
                              alterar(chave, { alimentoId: e.target.value || null })
                            }
                          >
                            <option value="">
                              {item.candidatos.length === 0
                                ? 'Nenhum parecido no catálogo — cadastre o alimento'
                                : 'Escolha qual é'}
                            </option>
                            {item.candidatos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {rotuloDoCandidato(c)}
                              </option>
                            ))}
                          </select>
                          {item.alimentoIdSugerido === null && item.candidatos.length > 1 && (
                            <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                              Mais de um alimento serve para “{item.nomeLido}”. Só o documento diz
                              qual.
                            </span>
                          )}
                        </label>

                        <label className="flex flex-col gap-xs">
                          <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                            Quantidade em gramas
                          </span>
                          <input
                            type="number"
                            min={1}
                            className="min-h-toque rounded-md border px-md"
                            style={{
                              background: 'var(--vv-superficie)',
                              borderColor: escolha.quantidadeG
                                ? 'var(--vv-borda)'
                                : 'var(--vv-erro)',
                              color: 'var(--vv-texto-primario)',
                            }}
                            value={escolha.quantidadeG}
                            onChange={(e) => alterar(chave, { quantidadeG: e.target.value })}
                          />
                          {/*
                            O documento disse "1 concha" e não gramas. Se o
                            alimento escolhido tem medida caseira cadastrada,
                            oferecemos a conversão — como botão, nunca
                            preenchida sozinha: a medida do catálogo é uma
                            média, e quem viu o prato é a nutricionista.
                          */}
                          {item.quantidadeG === null && item.medidaCaseiraLida && (
                            <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                              O documento diz “{item.medidaCaseiraLida}”, não gramas.
                              {escolhido?.medidaGramas != null && (
                                <>
                                  {' '}
                                  <button
                                    type="button"
                                    className="underline"
                                    onClick={() =>
                                      alterar(chave, {
                                        quantidadeG: String(escolhido.medidaGramas),
                                      })
                                    }
                                  >
                                    Usar {escolhido.medidaCaseira} = {escolhido.medidaGramas} g
                                  </button>
                                </>
                              )}
                            </span>
                          )}
                        </label>
                      </div>

                      {item.observacao && (
                        <p className="mt-xs text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                          Observação no documento: {item.observacao}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          ))}

          <Cartao>
            {pendencias > 0 ? (
              <Aviso tipo="info">
                {pendencias === 1
                  ? 'Falta 1 item sem alimento escolhido ou sem quantidade.'
                  : `Faltam ${pendencias} itens sem alimento escolhido ou sem quantidade.`}{' '}
                Os campos pendentes estão com a borda vermelha.
              </Aviso>
            ) : (
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Tudo conferido. Salvar cria o plano como qualquer outro — o histórico e as versões
                seguem valendo.
              </p>
            )}
            <div className="mt-lg flex flex-wrap gap-md">
              <Botao variante="neutra" disabled={!podeSalvar} onClick={() => void salvar(false)}>
                Salvar como rascunho
              </Botao>
              <Botao disabled={!podeSalvar} onClick={() => void salvar(true)}>
                {salvando ? 'Salvando…' : 'Salvar e ativar'}
              </Botao>
            </div>
          </Cartao>
        </>
      )}
    </div>
  );
}

/** Caloria no rótulo: é o que separa "Feijão cozido" de "Feijão cru" a olho. */
function rotuloDoCandidato(c: AlimentoCandidato): string {
  const kcal = `${Math.round(c.kcalPor100g)} kcal/100 g`;
  return c.medidaCaseira ? `${c.nome} — ${kcal} · ${c.medidaCaseira}` : `${c.nome} — ${kcal}`;
}

function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
    return 'O aluno ainda não autorizou. Peça para ele abrir o aplicativo, ir em Minha equipe e ativar "Alimentação" e "Leitura automática de documentos".';
  }
  /*
    O servidor manda o motivo em CONFLITO — "formato não aceito", "chave não
    pertence a você", "leitura não configurada". Trocar isso por um texto
    genérico esconderia justamente o que diz o que fazer a seguir.
  */
  if (e instanceof ErroApi && e.codigo === 'CONFLITO') {
    return e.message;
  }
  return 'Não foi possível ler o documento. Tente o PDF original ou uma foto mais nítida.';
}
