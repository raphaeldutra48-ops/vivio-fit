'use client';

import type { ConversaResumo, MensagemResumo } from '@vivio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../../components/ui';
import { sdk } from '../../../lib/sdk';

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [ativa, setAtiva] = useState<ConversaResumo | null>(null);
  const [mensagens, setMensagens] = useState<MensagemResumo[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const fimDaLista = useRef<HTMLDivElement>(null);

  const carregarConversas = useCallback(async () => {
    try {
      setConversas(await sdk.chat.listarConversas());
    } catch {
      setErro('Não foi possível carregar suas conversas.');
    }
  }, []);

  useEffect(() => {
    void carregarConversas();
    // Enquanto o WebSocket não está ligado nesta tela, uma sondagem leve mantém
    // a lista viva. Trocar por socket é o próximo passo.
    const intervalo = setInterval(() => void carregarConversas(), 15_000);
    return () => clearInterval(intervalo);
  }, [carregarConversas]);

  const abrir = useCallback(async (conversa: ConversaResumo) => {
    setAtiva(conversa);
    setErro(null);
    try {
      const historico = await sdk.chat.mensagens(conversa.id);
      // A API devolve da mais nova para a mais antiga; a tela lê ao contrário.
      setMensagens([...historico.dados].reverse());
      await sdk.chat.marcarVista(conversa.id);
      await carregarConversas();
    } catch {
      setErro('Não foi possível abrir a conversa.');
    }
  }, [carregarConversas]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const corpo = texto.trim();
    if (!corpo || !ativa) return;

    setTexto('');
    try {
      const enviada = await sdk.chat.enviar(ativa.id, { clienteUuid: uuid(), corpo });
      setMensagens((atual) =>
        atual.some((m) => m.id === enviada.id) ? atual : [...atual, enviada],
      );
      await carregarConversas();
    } catch {
      setErro('Não foi possível enviar. Tente de novo.');
      setTexto(corpo);
    }
  }

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Conversas com os alunos que você acompanha.
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-lg lg:grid-cols-[280px_1fr]">
        {/* Lista de conversas */}
        <aside className="flex flex-col gap-sm">
          {conversas.length === 0 && (
            <Aviso tipo="info">
              Nenhuma conversa ainda. Ela aparece aqui quando você ou o aluno enviarem a primeira
              mensagem.
            </Aviso>
          )}
          {conversas.map((conversa) => {
            const selecionada = ativa?.id === conversa.id;
            return (
              <button
                key={conversa.id}
                onClick={() => void abrir(conversa)}
                aria-current={selecionada ? 'true' : undefined}
                className="min-h-toque rounded-md border p-md text-left"
                style={{
                  borderColor: selecionada ? 'var(--vv-acao-fundo)' : 'var(--vv-borda)',
                  background: 'var(--vv-superficie)',
                }}
              >
                <div className="flex items-center justify-between gap-sm">
                  <span className="font-semibold">{conversa.contraparte?.nome ?? 'Conversa'}</span>
                  {conversa.naoLidas > 0 && (
                    <span
                      className="rounded-pill px-sm text-xs font-bold"
                      style={{ background: 'var(--vv-acao-fundo)', color: 'var(--vv-acao-texto)' }}
                    >
                      {conversa.naoLidas}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
                  {conversa.ultimaMensagem?.corpo ?? 'sem mensagens'}
                </p>
              </button>
            );
          })}
        </aside>

        {/* Conversa aberta */}
        <Cartao className="flex min-h-[460px] flex-col">
          {!ativa ? (
            <div className="grid flex-1 place-items-center">
              <p style={{ color: 'var(--vv-texto-secundario)' }}>
                Escolha uma conversa à esquerda.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b pb-md" style={{ borderColor: 'var(--vv-borda)' }}>
                <p className="font-semibold">{ativa.contraparte?.nome}</p>
              </div>

              <div className="flex flex-1 flex-col gap-sm overflow-y-auto py-md" style={{ maxHeight: 420 }}>
                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    className="max-w-[78%] rounded-lg px-md py-sm"
                    style={{
                      alignSelf: m.minha ? 'flex-end' : 'flex-start',
                      background: m.minha ? 'var(--vv-primaria-fundo)' : 'var(--vv-superficie-elevada)',
                      color: m.minha ? 'var(--vv-primaria-texto)' : 'var(--vv-texto-primario)',
                      border: m.minha ? 'none' : '1px solid var(--vv-borda)',
                    }}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.corpo ?? '(removida)'}</p>
                    <p className="mt-xs text-xs" style={{ opacity: 0.75 }}>
                      {horaDe(m.enviadaEm)}
                    </p>
                  </div>
                ))}
                <div ref={fimDaLista} />
              </div>

              <form onSubmit={enviar} className="flex gap-md border-t pt-md" style={{ borderColor: 'var(--vv-borda)' }}>
                <input
                  aria-label="Mensagem"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escreva uma mensagem…"
                  className="min-h-toque flex-1 rounded-md border px-md"
                  style={{
                    background: 'var(--vv-superficie)',
                    borderColor: 'var(--vv-borda)',
                    color: 'var(--vv-texto-primario)',
                  }}
                />
                <Botao type="submit" disabled={!texto.trim()}>
                  Enviar
                </Botao>
              </form>
            </>
          )}
        </Cartao>
      </div>
    </div>
  );
}
