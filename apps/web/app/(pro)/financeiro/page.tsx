'use client';

import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_SITUACAO,
  formatarDinheiro,
  paraCentavos,
  type CobrancaResumo,
  type FormaPagamento,
  type ResumoFinanceiro,
  type SituacaoCobranca,
} from '@vivio/contracts';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Etiqueta } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

const corDaSituacao: Record<SituacaoCobranca, string> = {
  PENDENTE: 'var(--vv-texto-secundario)',
  ATRASADA: 'var(--vv-erro)',
  PAGA: 'var(--vv-sucesso)',
  CANCELADA: 'var(--vv-texto-secundario)',
};

const mesAtual = () => new Date().toISOString().slice(0, 7);

export default function Financeiro() {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<ResumoFinanceiro | null>(null);
  const [alunos, setAlunos] = useState<{ id: string; nome: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [abrindo, setAbrindo] = useState(false);
  const [alunoId, setAlunoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorTexto, setValorTexto] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [repetirMeses, setRepetir] = useState(1);

  /** Cobrança com o formulário de pagamento aberto. */
  const [pagando, setPagando] = useState<string | null>(null);
  const [forma, setForma] = useState<FormaPagamento>('PIX');

  const carregar = () =>
    sdk.financeiro
      .resumo({ mes })
      .then(setDados)
      .catch(() => setErro('Não foi possível carregar o financeiro.'));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  useEffect(() => {
    sdk.vinculos
      .meusAlunos('ATIVO')
      .then((v) => setAlunos(v.map((x) => ({ id: x.contraparte.id, nome: x.contraparte.nome }))))
      .catch(() => undefined);
  }, []);

  const centavos = paraCentavos(valorTexto);
  const podeSalvar = Boolean(alunoId) && descricao.trim().length >= 2 && centavos && vencimento;

  async function criar() {
    setErro(null);
    setSalvando(true);
    try {
      await sdk.financeiro.criar({
        alunoId,
        descricao: descricao.trim(),
        valorCentavos: centavos!,
        vencimento: new Date(`${vencimento}T12:00:00`),
        repetirMeses,
      });
      setAbrindo(false);
      setDescricao('');
      setValorTexto('');
      setVencimento('');
      setRepetir(1);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a cobrança.');
    } finally {
      setSalvando(false);
    }
  }

  async function pagar(c: CobrancaResumo) {
    try {
      await sdk.financeiro.registrarPagamento(c.id, { pagaEm: new Date(), formaPagamento: forma });
      setPagando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o pagamento.');
    }
  }

  async function acao(c: CobrancaResumo, qual: 'estornar' | 'cancelar' | 'remover') {
    if (qual === 'remover' && !confirm(`Remover "${c.descricao}" e as parcelas não pagas?`)) return;
    try {
      if (qual === 'estornar') await sdk.financeiro.estornar(c.id);
      if (qual === 'cancelar') await sdk.financeiro.cancelar(c.id);
      if (qual === 'remover') await sdk.financeiro.remover(c.id);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    }
  }

  const Metrica = ({
    rotulo,
    centavos: v,
    cor,
  }: {
    rotulo: string;
    centavos: number;
    cor?: string;
  }) => (
    <Cartao className="flex-1 min-w-[170px]">
      <p className="text-xs uppercase" style={{ color: 'var(--vv-texto-secundario)' }}>
        {rotulo}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: cor }}>
        {formatarDinheiro(v)}
      </p>
    </Cartao>
  );

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-bold">Controle financeiro</h1>
          <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
            Quem pagou, quem está devendo e quanto entrou no mês.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-md">
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Mês
            </span>
            <input
              type="month"
              className="min-h-toque rounded-md border px-md"
              style={entrada}
              value={mes}
              onChange={(e) => setMes(e.target.value || mesAtual())}
            />
          </label>
          <Botao onClick={() => setAbrindo((a) => !a)} variante={abrindo ? 'neutra' : 'acao'}>
            {abrindo ? 'Cancelar' : '+ Nova cobrança'}
          </Botao>
        </div>
      </div>

      {abrindo && (
        <Cartao>
          <div className="grid gap-md sm:grid-cols-2">
            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Aluno
              </span>
              <select
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={alunoId}
                onChange={(e) => setAlunoId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {alunos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              rotulo="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Mensalidade de acompanhamento"
            />

            <Campo
              rotulo="Valor"
              value={valorTexto}
              onChange={(e) => setValorTexto(e.target.value)}
              placeholder="149,90"
              inputMode="decimal"
              erro={valorTexto && !centavos ? 'Valor inválido' : undefined}
            />

            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Primeiro vencimento
              </span>
              <input
                type="date"
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-xs">
              <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                Repetir por quantos meses
              </span>
              <input
                type="number"
                min={1}
                max={36}
                className="min-h-toque rounded-md border px-md"
                style={entrada}
                value={repetirMeses}
                onChange={(e) => setRepetir(Math.max(1, Number(e.target.value)))}
              />
              <span className="text-xs" style={{ color: 'var(--vv-texto-secundario)' }}>
                {repetirMeses > 1
                  ? `Gera ${repetirMeses} parcelas de ${centavos ? formatarDinheiro(centavos) : '—'}, uma por mês.`
                  : 'Cobrança única.'}
              </span>
            </label>
          </div>

          {erro && (
            <div className="mt-md">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}

          <div className="mt-lg flex justify-end">
            <Botao onClick={criar} disabled={!podeSalvar || salvando}>
              {salvando ? 'Criando…' : 'Criar cobrança'}
            </Botao>
          </div>
        </Cartao>
      )}

      {!abrindo && erro && <Aviso tipo="erro">{erro}</Aviso>}

      {dados && (
        <>
          <div className="flex flex-wrap gap-md">
            <Metrica rotulo="Recebido" centavos={dados.recebidoCentavos} cor="var(--vv-sucesso)" />
            <Metrica rotulo="A receber" centavos={dados.aReceberCentavos} />
            <Metrica
              rotulo="Atrasado"
              centavos={dados.atrasadoCentavos}
              cor={dados.atrasadoCentavos > 0 ? 'var(--vv-erro)' : undefined}
            />
          </div>

          {dados.alunosEmAtraso > 0 && (
            <Aviso tipo="erro">
              {dados.alunosEmAtraso === 1
                ? '1 aluno com pagamento atrasado.'
                : `${dados.alunosEmAtraso} alunos com pagamento atrasado.`}
            </Aviso>
          )}

          <div className="flex flex-col gap-md">
            {dados.cobrancas.map((c) => (
              <Cartao key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div>
                    <p className="font-semibold">{c.aluno.nome}</p>
                    <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {c.descricao} · vence{' '}
                      {new Date(`${c.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                      {c.situacao === 'ATRASADA' && ` · ${c.diasDeAtraso} dias de atraso`}
                      {c.pagaEm &&
                        ` · pago em ${new Date(`${c.pagaEm}T12:00:00`).toLocaleDateString('pt-BR')}${c.formaPagamento ? ` (${ROTULO_FORMA_PAGAMENTO[c.formaPagamento]})` : ''}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-sm">
                    <p className="text-lg font-bold tabular-nums">
                      {formatarDinheiro(c.valorCentavos)}
                    </p>
                    <Etiqueta texto={ROTULO_SITUACAO[c.situacao]} cor={corDaSituacao[c.situacao]} />
                  </div>
                </div>

                {pagando === c.id ? (
                  <div className="mt-lg flex flex-wrap items-end justify-end gap-md">
                    <label className="flex flex-col gap-xs">
                      <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                        Como recebeu
                      </span>
                      <select
                        className="min-h-toque rounded-md border px-md"
                        style={entrada}
                        value={forma}
                        onChange={(e) => setForma(e.target.value as FormaPagamento)}
                      >
                        {Object.entries(ROTULO_FORMA_PAGAMENTO).map(([valor, rotulo]) => (
                          <option key={valor} value={valor}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Botao variante="neutra" onClick={() => setPagando(null)}>
                      Cancelar
                    </Botao>
                    <Botao onClick={() => pagar(c)}>Confirmar recebimento</Botao>
                  </div>
                ) : (
                  <div className="mt-md flex flex-wrap justify-end gap-sm">
                    <button
                      onClick={() => acao(c, 'remover')}
                      className="text-sm underline"
                      style={{ color: 'var(--vv-texto-secundario)' }}
                    >
                      Remover
                    </button>
                    {c.situacao === 'PAGA' ? (
                      <Botao variante="neutra" onClick={() => acao(c, 'estornar')}>
                        Estornar
                      </Botao>
                    ) : (
                      <>
                        {c.situacao !== 'CANCELADA' && (
                          <Botao variante="neutra" onClick={() => acao(c, 'cancelar')}>
                            Cancelar cobrança
                          </Botao>
                        )}
                        <Botao onClick={() => setPagando(c.id)}>Registrar pagamento</Botao>
                      </>
                    )}
                  </div>
                )}
              </Cartao>
            ))}
          </div>

          {dados.cobrancas.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>Nenhuma cobrança neste mês.</p>
          )}
        </>
      )}
    </div>
  );
}
