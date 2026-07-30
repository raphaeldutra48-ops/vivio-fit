'use client';

import { Papel, type PlanoTreinoResumo, type ResumoAluno } from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { areaTemaClaro } from '@vivio/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
          {!semConsentimento && (
            <Link href={`/alunos/${alunoId}/treino/novo`}>
              <Botao variante="neutra">Montar treino</Botao>
            </Link>
          )}
          {usuario && PRESCRITORES.includes(usuario.papel) && (
            <Link href={`/alunos/${alunoId}/prescricoes`}>
              <Botao variante="neutra">Prescrever</Botao>
            </Link>
          )}
          <Link href={`/alunos/${alunoId}/dieta`}>
            <Botao>Montar dieta</Botao>
          </Link>
        </div>
      </header>

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

      <section>
        <h2 className="mb-md text-lg font-semibold">Treino</h2>

        {semConsentimento ? (
          <Cartao>
            <p className="mb-xs font-semibold">Dados de treino não compartilhados</p>
            <Aviso tipo="info">
              {aluno.nome.split(' ')[0]} ainda não autorizou o compartilhamento dos dados de treino.
              A autorização é dada pelo próprio aluno, no aplicativo.
            </Aviso>
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
