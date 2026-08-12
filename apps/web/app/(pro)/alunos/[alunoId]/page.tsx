'use client';

import { Papel, type PlanoTreinoResumo, type ResumoAluno } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { areaTemaClaro } from '@vivio/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertasClinicos } from '../../../../components/AlertasClinicos';
import { CondicoesDeSaude } from '../../../../components/CondicoesDeSaude';
import { CardioDoAluno } from '../../../../components/CardioDoAluno';
import { MetasDoAluno } from '../../../../components/MetasDoAluno';
import { PainelDeProgresso } from '../../../../components/PainelDeProgresso';
import { Aviso, Botao, Cartao, Etiqueta } from '../../../../components/ui';
import { sdk } from '../../../../lib/sdk';
import { useSessao } from '../../../../lib/sessao';

const PRESCRITORES: Papel[] = [Papel.NUTRICIONISTA, Papel.MEDICO, Papel.ADMIN];

export default function FichaDoAluno() {
  const { alunoId } = useParams<{ alunoId: string }>();
  const { usuario } = useSessao();
  const [aluno, setAluno] = useState<ResumoAluno | null>(null);
  const [planos, setPlanos] = useState<PlanoTreinoResumo[]>([]);
  const [semConsentimento, setSemConsentimento] = useState(false);
  /** Sobe a cada mudança em condição, para os alertas serem buscados de novo. */
  const [versaoClinica, setVersaoClinica] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    sdk.alunos
      .resumo(alunoId)
      .then(setAluno)
      .catch(() => setErro('Não foi possível carregar a ficha.'));

    sdk.medidas
      .listar(alunoId)
      .catch(() => undefined)
      .then(() => undefined);

    // O 403 por consentimento não é falha: é informação para a tela mostrar.
    void (async () => {
      try {
        setPlanos(await sdk.treinos.listar(alunoId));
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === 'CONSENTIMENTO_AUSENTE') {
          setSemConsentimento(true);
        }
      }
    })();
  }, [alunoId]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!aluno) return <Aviso tipo="info">Carregando…</Aviso>;

  const ativo = planos.find((p) => p.status === 'ATIVO');

  return (
    <div className="flex flex-col gap-xl">
      <Link href="/alunos" className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
        ← Meus alunos
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-lg">
        <div>
          <h1 className="text-2xl font-bold">{aluno.nome}</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            {[
              aluno.idade !== null && `${aluno.idade} anos`,
              aluno.alturaCm && `${aluno.alturaCm} cm`,
              aluno.objetivo,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-md">
          {/*
            Sem autorização o botão fica visível e desligado, em vez de sumir.
            Sumir foi o comportamento anterior e ensinava a coisa errada: o
            profissional procurava um botão que não existia mais e concluía que
            o app estava quebrado, quando o que faltava era uma decisão do
            aluno — que ele nem sabia que existia.
          */}
          {semConsentimento ? (
            <Botao
              variante="neutra"
              disabled
              title="O aluno precisa autorizar o compartilhamento dos dados de treino no aplicativo dele."
            >
              Montar treino · aguardando o aluno
            </Botao>
          ) : (
            <Link href={`/alunos/${alunoId}/treino/novo`}>
              <Botao variante="neutra">Montar treino</Botao>
            </Link>
          )}
          <Link href={`/alunos/${alunoId}/anamnese`}>
            <Botao variante="neutra">Anamnese</Botao>
          </Link>
          {/* Sem condicionar a `semConsentimento`: o comparativo é de EVOLUCAO,
              não de TREINO, e a própria tela trata a falta de autorização. */}
          <Link href={`/alunos/${alunoId}/comparativo`}>
            <Botao variante="neutra">Comparativo</Botao>
          </Link>
          {usuario && PRESCRITORES.includes(usuario.papel) && (
            <>
              <Link href={`/alunos/${alunoId}/prescricoes`}>
                <Botao variante="neutra">Prescrever</Botao>
              </Link>
              {/* Exame é do nutricionista e do médico. O personal não abre. */}
              <Link href={`/alunos/${alunoId}/exames/novo`}>
                <Botao variante="neutra">Novo exame</Botao>
              </Link>
            </>
          )}
          <Link href={`/alunos/${alunoId}/dieta`}>
            <Botao>Montar dieta</Botao>
          </Link>
        </div>
      </header>

      {/*
        Antes da equipe e do treino de propósito: se há alerta pendente, ele
        muda a conduta do que vem abaixo.
      */}
      {/*
        As duas seções são irmãs e uma nasce da outra: registrar ou dar alta
        numa condição cria ou apaga alertas. O contador liga as duas — sem ele,
        o alerta de uma lesão já resolvida ficaria na tela até recarregar.
      */}
      <AlertasClinicos alunoId={alunoId} atualizarEm={versaoClinica} />

      {/* Logo abaixo dos alertas: é a causa deles, e quem lê o alerta costuma
          querer ver o fato que o originou. */}
      <CondicoesDeSaude alunoId={alunoId} aoMudar={() => setVersaoClinica((v) => v + 1)} />

      <section>
        <h2 className="mb-md text-lg font-semibold">Equipe de cuidado</h2>
        <div className="flex flex-wrap gap-md">
          {aluno.equipe.map((membro) => (
            <Cartao key={membro.profissional.id} className="flex-1 min-w-[200px]">
              <p className="text-xs uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
                {membro.tipo}
              </p>
              <p className="font-semibold">{membro.profissional.nome}</p>
            </Cartao>
          ))}
        </div>
      </section>

      {/*
        Acima do plano de propósito: o plano diz o que foi prescrito, o painel
        diz o que aconteceu. Quem abre a ficha quer saber como a pessoa está
        antes de olhar o que foi mandado ela fazer.

        Sem condicionar a `semConsentimento`: aquele sinalizador é do escopo
        TREINO, e o painel exige EVOLUCAO. Escondê-lo aqui deixava sem painel
        quem autorizou evolução e não treino — que é justamente quem mais
        aparece, porque evolução é o consentimento mais comum.

        O próprio painel trata a falta de autorização.
      */}
      <PainelDeProgresso alunoId={alunoId} nomeDoAluno={aluno.nome} />

      {/* Logo abaixo do painel: a meta e o que da sentido aos numeros dele. */}
      <MetasDoAluno alunoId={alunoId} />

      {/*
        O esforço que não aparece na ficha de treino: a corrida de domingo e a
        esteira depois da musculação. Sem isto o aluno registra e ninguém lê —
        e quem registra sem ser lido para de registrar.
      */}
      <CardioDoAluno alunoId={alunoId} />

      <section>
        <h2 className="mb-md text-lg font-semibold">Treino</h2>

        {semConsentimento ? (
          <Cartao>
            <p className="mb-xs font-semibold">Dados de treino não compartilhados</p>
            <Aviso tipo="info">
              {aluno.nome.split(' ')[0]} ainda não autorizou o compartilhamento dos dados de treino,
              e por isso não é possível montar o plano ainda.
            </Aviso>
            {/*
              O caminho exato, e não só a informação de que falta autorização.
              Sem ele o profissional sabe o que está errado e não sabe o que
              dizer ao aluno — e quem paga por isso é o aluno, que recebe um
              "autoriza lá" sem saber onde é "lá".
            */}
            <p className="mt-md text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Peça a {aluno.nome.split(' ')[0]} para abrir o aplicativo e tocar em{' '}
              <strong>Minha equipe</strong> → em <strong>O que eu compartilho</strong>, tocar em{' '}
              <strong>Treino</strong>. A decisão é dele e pode ser desfeita quando quiser.
            </p>
          </Cartao>
        ) : planos.length === 0 ? (
          <Aviso tipo="info">Nenhum plano montado ainda.</Aviso>
        ) : (
          <div className="flex flex-col gap-md">
            {planos.map((p) => (
              <Cartao key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-md">
                  <div>
                    <p className="font-semibold">{p.nome}</p>
                    <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      versão {p.versao} · {p.totalSessoes}{' '}
                      {p.totalSessoes === 1 ? 'sessão' : 'sessões'} · por {p.personal.nome}
                    </p>
                  </div>
                  <Etiqueta
                    texto={p.status === 'ATIVO' ? 'Ativo' : p.status === 'RASCUNHO' ? 'Rascunho' : 'Arquivado'}
                    cor={
                      p.status === 'ATIVO'
                        ? areaTemaClaro.treino.texto
                        : 'var(--vv-texto-secundario)'
                    }
                  />
                </div>
              </Cartao>
            ))}
            {ativo && (
              <Aviso tipo="info">
                Ajustar o plano ativo cria uma versão nova — a anterior fica no histórico.
              </Aviso>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
