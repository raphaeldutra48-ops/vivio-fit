'use client';

import {
  GRUPOS_MUSCULARES,
  LIMITES_MIDIA,
  TipoMidia,
  type ExercicioResumo,
  type GrupoMuscular,
} from '@vivio/contracts';
import { useEffect, useRef, useState } from 'react';
import { FichaDeExercicio } from '../../../components/FichaDeExercicio';
import { FilaDeGravacao } from '../../../components/FilaDeGravacao';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

export default function Exercicios() {
  const [exercicios, setExercicios] = useState<ExercicioResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [grupo, setGrupo] = useState<GrupoMuscular>('PEITO');
  const [equipamento, setEquipamento] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [criando, setCriando] = useState(false);

  const [enviandoVideoDe, setEnviandoVideoDe] = useState<string | null>(null);
  /** Incrementa a cada gravação salva, para a fila se refazer. */
  const [filaVersao, setFilaVersao] = useState(0);
  const [videoAberto, setVideoAberto] = useState<{ id: string; url: string } | null>(null);
  /** Qual exercício está com a ficha aberta — um por vez. */
  const [aberto, setAberto] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const ehExercicioProprio = useRef(false);
  const exercicioAlvo = useRef<string | null>(null);

  async function recarregar() {
    try {
      setExercicios(await sdk.exercicios.listar({ q: busca || undefined, limit: 100 }));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar a biblioteca.');
    }
  }

  useEffect(() => {
    void recarregar();
  }, [busca]);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setCriando(true);
    setMensagem(null);
    try {
      await sdk.exercicios.criar({
        nome,
        grupoMuscular: grupo,
        equipamento: equipamento || undefined,
        instrucoes: instrucoes || undefined,
      });
      setNome('');
      setEquipamento('');
      setInstrucoes('');
      setMensagem('Exercício criado na sua biblioteca.');
      await recarregar();
    } catch {
      setErro('Não foi possível criar o exercício.');
    } finally {
      setCriando(false);
    }
  }

  function escolherVideo(exercicioId: string, ehMeuExercicio: boolean) {
    exercicioAlvo.current = exercicioId;
    /*
      Num exercício próprio o vídeo vai para o exercício em si; num global,
      vira minha demonstração — o mesmo botão, destinos diferentes, porque
      para quem grava a ação é a mesma e a distinção é do sistema.
    */
    ehExercicioProprio.current = ehMeuExercicio;
    inputArquivo.current?.click();
  }

  async function enviarVideo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    const exercicioId = exercicioAlvo.current;
    evento.target.value = ''; // permite reenviar o mesmo arquivo depois
    if (!arquivo || !exercicioId) return;

    const limite = LIMITES_MIDIA[TipoMidia.VIDEO_EXERCICIO];
    if (!limite.mimesAceitos.includes(arquivo.type)) {
      setErro(`Formato não aceito. Use ${limite.mimesAceitos.join(', ')}.`);
      return;
    }
    if (arquivo.size > limite.tamanhoMaximoBytes) {
      setErro(`O vídeo passa de ${Math.round(limite.tamanhoMaximoBytes / 1024 / 1024)} MB.`);
      return;
    }

    setEnviandoVideoDe(exercicioId);
    setErro(null);
    try {
      const autorizacao = await sdk.midia.autorizarUpload({
        tipo: TipoMidia.VIDEO_EXERCICIO,
        mimeType: arquivo.type,
        tamanhoBytes: arquivo.size,
      });
      await sdk.midia.enviarArquivo(autorizacao, arquivo);
      if (ehExercicioProprio.current) {
        await sdk.exercicios.vincularVideo(exercicioId, autorizacao.chave);
      } else {
        await sdk.exercicios.gravarDemonstracao(exercicioId, autorizacao.chave);
      }
      setMensagem('Gravação salva. Seus alunos já veem durante o treino.');
      // Encurta a fila junto com a lista: o item recém-gravado sai de cena.
      setFilaVersao((v) => v + 1);
      await recarregar();
    } catch {
      setErro('Não foi possível enviar o vídeo.');
    } finally {
      setEnviandoVideoDe(null);
    }
  }

  async function verVideo(exercicioId: string) {
    try {
      const { url } = await sdk.exercicios.urlDoVideo(exercicioId);
      setVideoAberto({ id: exercicioId, url });
    } catch {
      setErro('Não foi possível abrir o vídeo.');
    }
  }

  const meus = exercicios.filter((e) => e.escopo === 'PRIVADO');
  const globais = exercicios.filter((e) => e.escopo === 'GLOBAL');

  function Lista({ itens, titulo }: { itens: ExercicioResumo[]; titulo: string }) {
    if (itens.length === 0) return null;
    return (
      <section className="flex flex-col gap-md">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {itens.map((e) =>
          aberto === e.id ? (
            <FichaDeExercicio
              key={e.id}
              exercicio={e}
              aoFechar={() => {
                setAberto(null);
                setVideoAberto(null);
              }}
              videoUrl={videoAberto?.id === e.id ? videoAberto.url : null}
              aoPedirVideo={() => void verVideo(e.id)}
            />
          ) : (
          <Cartao key={e.id}>
            <div className="flex flex-wrap items-center justify-between gap-md">
              <div className="flex items-center gap-md">
                {/*
                  Miniatura na lista: biblioteca se navega olhando. Sem ela, a
                  tela é uma lista de nomes e escolher exercício exige abrir um
                  por um.
                */}
                {e.imagemUrl && (
                  <img
                    src={e.imagemUrl}
                    alt=""
                    aria-hidden
                    width={56}
                    height={56}
                    className="rounded-md"
                    style={{ objectFit: 'contain', background: 'var(--vv-fundo)' }}
                  />
                )}
                <div>
                  <button
                    onClick={() => setAberto(e.id)}
                    className="text-left font-semibold underline"
                  >
                    {e.nome}
                  </button>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {e.grupoMuscular.replace('_', ' ')}
                    {e.equipamento && ` · ${e.equipamento}`}
                    {e.passos.length > 0 && ' · passo a passo'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-md">
                {/*
                  Três estados, não dois. "Já gravei este" e "o acervo tem um
                  vídeo genérico" são coisas diferentes para quem está passando
                  por 159 exercícios — juntar as duas num "com vídeo" só faz
                  regravar o que já foi gravado.
                */}
                {e.temDemonstracao ? (
                  <>
                    <Etiqueta texto="✓ gravei este" cor="var(--vv-sucesso)" />
                    <Botao variante="neutra" onClick={() => void verVideo(e.id)}>
                      Rever
                    </Botao>
                  </>
                ) : e.temVideo ? (
                  <>
                    <Etiqueta texto="vídeo do acervo" cor="var(--vv-texto-secundario)" />
                    <Botao variante="neutra" onClick={() => void verVideo(e.id)}>
                      Ver
                    </Botao>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    sem vídeo
                  </span>
                )}
                {/*
                  A gravação própria vale para o exercício GLOBAL também, e é
                  esse o ponto: o personal quer gravar o supino da academia
                  dele sem criar um "supino do Diego", que quebraria o
                  histórico de carga do aluno — indexado por exercício.

                  `capture` faz o celular abrir a câmera direto em vez do
                  seletor de arquivos. No computador o atributo é ignorado e
                  vira uma escolha de arquivo comum, que é o comportamento
                  certo nos dois lugares.
                */}
                <Botao
                  variante="neutra"
                  disabled={enviandoVideoDe === e.id}
                  onClick={() => escolherVideo(e.id, e.escopo === 'PRIVADO')}
                >
                  {enviandoVideoDe === e.id
                    ? 'Enviando…'
                    : e.temDemonstracao
                      ? '🎥 Regravar'
                      : '🎥 Gravar minha demonstração'}
                </Botao>
              </div>
            </div>

            {videoAberto?.id === e.id && (
              <video
                controls
                src={videoAberto.url}
                className="mt-md w-full rounded-md"
                style={{ maxHeight: 420, background: '#000' }}
              />
            )}
          </Cartao>
          ),
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Biblioteca de exercícios</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Vídeos ficam em armazenamento privado — o link expira em 5 minutos.
        </p>
      </div>

      <input
        ref={inputArquivo}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        capture="environment"
        onChange={(e) => void enviarVideo(e)}
        className="hidden"
        aria-hidden
      />

      <Cartao>
        <form onSubmit={criar} className="flex flex-col gap-lg">
          <p className="font-semibold">Novo exercício na minha biblioteca</p>
          <div className="grid gap-md sm:grid-cols-3">
            <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Grupo muscular
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={{
                  background: 'var(--vv-superficie)',
                  borderColor: 'var(--vv-borda)',
                  color: 'var(--vv-texto-primario)',
                }}
                value={grupo}
                onChange={(e) => setGrupo(e.target.value as GrupoMuscular)}
              >
                {GRUPOS_MUSCULARES.map((g) => (
                  <option key={g} value={g}>
                    {g.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <Campo
              rotulo="Equipamento (opcional)"
              value={equipamento}
              onChange={(e) => setEquipamento(e.target.value)}
            />
          </div>
          <Campo
            rotulo="Instruções de execução (opcional)"
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            placeholder="Escápulas retraídas, cotovelos a 45 graus…"
          />
          <div>
            <Botao type="submit" disabled={criando || nome.trim().length < 2}>
              {criando ? 'Criando…' : 'Criar exercício'}
            </Botao>
          </div>
        </form>
      </Cartao>

      <Campo
        rotulo="Buscar na biblioteca"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="supino, agachamento…"
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {mensagem && <Aviso tipo="info">{mensagem}</Aviso>}

      <FilaDeGravacao
        aoGravar={escolherVideo}
        gravandoId={enviandoVideoDe}
        recarregarEm={filaVersao}
      />

      <Lista itens={meus} titulo="Meus exercícios" />
      <Lista itens={globais} titulo="Biblioteca global" />
    </div>
  );
}
