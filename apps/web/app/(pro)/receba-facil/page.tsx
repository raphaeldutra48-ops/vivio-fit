'use client';

import {
  ROTULO_TIPO_CHAVE,
  TipoChavePix,
  formatarDinheiro,
  validarChavePix,
  type CobrancaComPix,
  type CobrancaResumo,
  type DadosDePagamento,
} from '@vivio/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

const entrada = {
  background: 'var(--vv-superficie)',
  borderColor: 'var(--vv-borda)',
  color: 'var(--vv-texto-primario)',
};

export default function RecebaFacil() {
  const [dados, setDados] = useState<DadosDePagamento | null>(null);
  const [aReceber, setAReceber] = useState<CobrancaResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [tipoChave, setTipoChave] = useState<TipoChavePix>('CPF');
  const [chave, setChave] = useState('');
  const [recebedor, setRecebedor] = useState('');
  const [cidade, setCidade] = useState('');

  /** Código gerado, exibido num painel. */
  const [pix, setPix] = useState<CobrancaComPix | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = async () => {
    const d = await sdk.financeiro.obterPagamento().catch(() => null);
    if (d) {
      setDados(d);
      setTipoChave(d.tipoChave);
      setChave(d.chave);
      setRecebedor(d.recebedor);
      setCidade(d.cidade);
    }
    const resumo = await sdk.financeiro.resumo({}).catch(() => null);
    setAReceber(
      (resumo?.cobrancas ?? []).filter(
        (c) => c.situacao === 'PENDENTE' || c.situacao === 'ATRASADA',
      ),
    );
  };

  useEffect(() => {
    void carregar();
  }, []);

  const problemaDaChave = chave ? validarChavePix(tipoChave, chave) : null;
  const podeSalvar =
    !problemaDaChave && chave.length >= 3 && recebedor.trim().length >= 2 && cidade.trim().length >= 2;

  async function salvar() {
    setErro(null);
    setAviso(null);
    setSalvando(true);
    try {
      const salvo = await sdk.financeiro.salvarPagamento({
        tipoChave,
        chave,
        recebedor: recebedor.trim(),
        cidade: cidade.trim(),
      });
      setDados(salvo);
      setChave(salvo.chave);
      setAviso('Chave salva. Agora dá para gerar o código de qualquer cobrança.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a chave.');
    } finally {
      setSalvando(false);
    }
  }

  async function gerar(c: CobrancaResumo) {
    setErro(null);
    setCopiado(false);
    try {
      setPix(await sdk.financeiro.gerarPix(c.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o código.');
    }
  }

  async function copiar() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.brCode);
      setCopiado(true);
    } catch {
      setErro('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Receba Fácil</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Gere o PIX copia e cola das suas cobranças. O dinheiro cai direto na sua conta.
        </p>
      </div>

      <Cartao>
        <p className="mb-md font-semibold">Sua chave PIX</p>

        <div className="grid gap-md sm:grid-cols-2">
          <label className="flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              Tipo de chave
            </span>
            <select
              className="min-h-toque rounded-md border px-md"
              style={entrada}
              value={tipoChave}
              onChange={(e) => setTipoChave(e.target.value as TipoChavePix)}
            >
              {Object.entries(ROTULO_TIPO_CHAVE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>

          <Campo
            rotulo="Chave"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            erro={problemaDaChave ?? undefined}
          />

          <Campo
            rotulo="Nome de quem recebe (até 25 caracteres)"
            value={recebedor}
            onChange={(e) => setRecebedor(e.target.value)}
            placeholder="Como aparece na sua conta"
          />

          <Campo
            rotulo="Cidade (até 15 caracteres)"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Fortaleza"
          />
        </div>

        {erro && (
          <div className="mt-md">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
        {aviso && (
          <div className="mt-md">
            <Aviso tipo="info">{aviso}</Aviso>
          </div>
        )}

        <div className="mt-lg flex justify-end">
          <Botao onClick={salvar} disabled={!podeSalvar || salvando}>
            {salvando ? 'Salvando…' : dados ? 'Atualizar chave' : 'Salvar chave'}
          </Botao>
        </div>
      </Cartao>

      {/* Honestidade sobre o limite: sem gateway não existe confirmação
          automática, e prometer isso geraria cobrança perdida. */}
      <Aviso tipo="info">
        O Vívio Fit monta o código, mas não recebe o dinheiro nem sabe quando o pagamento cai — não
        somos intermediários. Confira no seu banco e marque como recebido em{' '}
        <Link href="/financeiro" className="underline">
          Controle financeiro
        </Link>
        .
      </Aviso>

      {pix && (
        <Cartao>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <p className="font-semibold">{pix.aluno}</p>
              <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                {pix.descricao}
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums">{formatarDinheiro(pix.valorCentavos)}</p>
          </div>

          <label className="mt-lg flex flex-col gap-xs">
            <span className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
              PIX copia e cola — mande para o aluno
            </span>
            <textarea
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-[110px] rounded-md border p-md font-mono text-xs"
              style={entrada}
              value={pix.brCode}
            />
          </label>

          <div className="mt-md flex flex-wrap justify-end gap-sm">
            <Botao variante="neutra" onClick={() => setPix(null)}>
              Fechar
            </Botao>
            <Botao onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar código'}</Botao>
          </div>
        </Cartao>
      )}

      <div>
        <h2 className="mb-md text-lg font-semibold">Cobranças a receber neste mês</h2>

        {!dados && (
          <Aviso tipo="info">Cadastre sua chave PIX acima para gerar os códigos.</Aviso>
        )}

        <div className="mt-md flex flex-col gap-md">
          {aReceber.map((c) => (
            <Cartao key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-md">
                <div>
                  <p className="font-semibold">{c.aluno.nome}</p>
                  <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                    {c.descricao} · vence{' '}
                    {new Date(`${c.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}
                    {c.situacao === 'ATRASADA' && (
                      <span style={{ color: 'var(--vv-erro)' }}> · atrasada</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-md">
                  <p className="font-bold tabular-nums">{formatarDinheiro(c.valorCentavos)}</p>
                  <Botao onClick={() => gerar(c)} disabled={!dados}>
                    Gerar PIX
                  </Botao>
                </div>
              </div>
            </Cartao>
          ))}

          {aReceber.length === 0 && (
            <p style={{ color: 'var(--vv-texto-secundario)' }}>
              Nenhuma cobrança em aberto neste mês. Crie em{' '}
              <Link href="/financeiro" className="underline">
                Controle financeiro
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
