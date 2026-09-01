import {
  VOLUMES_RAPIDOS_ML,
  cobrancaDaDieta,
  type PlanoDietaCompleto,
  type ResumoDeAgua,
} from '@vivio/contracts';
import { ErroApi } from '@vivio/sdk';
import { alvoToqueMin, espacamento, obterAreaTema, raio, tipografia } from '@vivio/ui-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FalhouAoCarregar } from '../../src/componentes/Estado';
import { sdk } from '../../src/sdk';
import { useSessao } from '../../src/sessao';


export default function Nutricao() {
  const { usuario, tema, nomeDoTema } = useSessao();
  /*
    A cor da area vem do tema, nao de um hexadecimal na tela. O valor fixo
    daqui (#3AA8C1) dava 2,78:1 como texto sobre fundo claro — reprovado — e
    era diferente do que a web usava para a MESMA area.
  */
  const areaTema = obterAreaTema(nomeDoTema).nutricao;
  const [dieta, setDieta] = useState<PlanoDietaCompleto | null>(null);
  const [agua, setAgua] = useState<ResumoDeAgua | null>(null);
  const [registros, setRegistros] = useState<Record<string, string>>({});
  const [semDieta, setSemDieta] = useState(false);
  /** Falha de rede — diferente de não ter plano. */
  const [falhou, setFalhou] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);

  /*
    Recalculada a cada mudança de registro, e não uma vez ao abrir: marcar uma
    refeição precisa fazer a cobrança encolher na hora. Se ela só mudasse na
    próxima abertura, a pessoa registraria e continuaria sendo cobrada — que é
    o jeito mais rápido de ensinar alguém a ignorar um aviso.
  */
  const cobranca = useMemo(
    () =>
      cobrancaDaDieta(
        dieta?.refeicoes.map((r) => ({
          id: r.id,
          nome: r.nome,
          horarioSugerido: r.horarioSugerido,
        })) ?? [],
        Object.keys(registros),
      ),
    [dieta, registros],
  );

  async function recarregar() {
    if (!usuario) return;
    setFalhou(false);
    sdk.dietas
      .obterAtiva(usuario.id)
      .then((d) => {
        setDieta(d);
        setSemDieta(false);
        setExpandida((atual) => atual ?? d.refeicoes[0]?.id ?? null);
      })
      /*
        404 e falta de sinal davam a mesma tela: "Seu nutricionista ainda não
        montou ou ativou um plano". Dito a quem está sem rede, é acusação falsa
        contra a profissional — e o aluno vai cobrá-la por um plano que já
        existe. O código do erro separa os dois.
      */
      .catch((e: unknown) => {
        if (e instanceof ErroApi && e.status === 404) setSemDieta(true);
        else setFalhou(true);
      });
    sdk.agua.resumo(usuario.id).then(setAgua).catch(() => undefined);
    sdk.dietas
      .registrosDoDia(usuario.id)
      .then((lista) =>
        setRegistros(Object.fromEntries(lista.map((r) => [r.refeicaoId, r.status]))),
      )
      .catch(() => undefined);
  }

  useEffect(() => {
    void recarregar();
  }, [usuario]);

  async function beber(volumeMl: number) {
    if (!usuario) return;
    // Resposta otimista: o toque precisa parecer instantâneo.
    setAgua((atual) =>
      atual
        ? {
            ...atual,
            consumidoMl: atual.consumidoMl + volumeMl,
            percentual: Math.min(100, Math.round(((atual.consumidoMl + volumeMl) / atual.metaMlDia) * 100)),
            minutosDesdeUltimoRegistro: 0,
          }
        : atual,
    );
    try {
      setAgua(await sdk.agua.registrar(usuario.id, { volumeMl, data: new Date() }));
    } catch {
      void recarregar();
    }
  }

  async function marcarRefeicao(refeicaoId: string, status: 'FEITA' | 'PULADA') {
    if (!usuario) return;
    const anterior = registros[refeicaoId];
    const novo = anterior === status ? undefined : status;
    setRegistros((r) => ({ ...r, [refeicaoId]: novo ?? '' }));
    if (!novo) return;
    await sdk.dietas
      .registrarRefeicao(usuario.id, { refeicaoId, status: novo, data: new Date() })
      .catch(() => void recarregar());
  }

  const cartao = {
    backgroundColor: tema.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: tema.borda,
    padding: espacamento.lg,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espacamento.lg, gap: espacamento.lg }}
    >
      {/*
        A cobrança vem antes da água e do plano, e só quando há o que cobrar.
        Ela é o motivo de a pessoa abrir esta aba num dia em que já sabe o que
        vai comer — e no fim da lista ninguém a veria.
      */}
      {cobranca.urgencia !== 'NADA' && cobranca.pendentes.length > 0 && (
        <View
          style={{
            ...cartao,
            borderColor: cobranca.urgencia === 'ATRASADO' ? tema.alerta : tema.borda,
            borderWidth: cobranca.urgencia === 'ATRASADO' ? 2 : 1,
            gap: espacamento.xs,
          }}
        >
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
            {cobranca.respondidas} de {cobranca.total} refeições registradas hoje
          </Text>
          <Text style={{ color: tema.textoSecundario }}>{cobranca.mensagem}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ir para ${cobranca.pendentes[0]!.nome}`}
            onPress={() => setExpandida(cobranca.pendentes[0]!.id)}
            style={{
              minHeight: alvoToqueMin,
              marginTop: espacamento.xs,
              borderRadius: raio.md,
              backgroundColor: tema.acaoFundo,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tema.acaoTexto, fontWeight: '700' }}>
              Registrar {cobranca.pendentes[0]!.nome.toLowerCase()}
            </Text>
          </Pressable>
        </View>
      )}

      {/* --- Água ---------------------------------------------------------- */}
      {agua && (
        <View style={{ ...cartao, gap: espacamento.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                Água hoje
              </Text>
              <Text
                style={{
                  color: tema.textoPrimario,
                  fontSize: tipografia.tamanho['2xl'],
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {(agua.consumidoMl / 1000).toFixed(1).replace('.', ',')} L
                <Text style={{ fontSize: tipografia.tamanho.sm, color: tema.textoSecundario }}>
                  {' '}
                  / {(agua.metaMlDia / 1000).toFixed(1).replace('.', ',')} L
                </Text>
              </Text>
            </View>
            <Text style={{ color: areaTema.texto, fontWeight: '700', fontSize: tipografia.tamanho.xl }}>
              {agua.percentual}%
            </Text>
          </View>

          {/* Barra de progresso */}
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: agua.percentual }}
            style={{ height: 10, borderRadius: raio.pill, backgroundColor: tema.fundo, overflow: 'hidden' }}
          >
            <View
              style={{
                width: `${agua.percentual}%`,
                height: '100%',
                backgroundColor: areaTema.cor,
                borderRadius: raio.pill,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: espacamento.xs }}>
            {VOLUMES_RAPIDOS_ML.map((ml) => (
              <Pressable
                key={ml}
                accessibilityRole="button"
                accessibilityLabel={`Registrar ${ml} mililitros de água`}
                onPress={() => void beber(ml)}
                style={{
                  flex: 1,
                  minHeight: alvoToqueMin,
                  borderRadius: raio.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: areaTema.cor,
                }}
              >
                <Text style={{ color: areaTema.texto, fontWeight: '700' }}>+{ml}</Text>
              </Pressable>
            ))}
          </View>

          {agua.minutosDesdeUltimoRegistro !== null && agua.minutosDesdeUltimoRegistro >= 180 && (
            <Text style={{ color: tema.alerta, fontSize: tipografia.tamanho.sm }}>
              Você não bebe água há {Math.floor(agua.minutosDesdeUltimoRegistro / 60)}h.
            </Text>
          )}
        </View>
      )}

      {/* --- Dieta --------------------------------------------------------- */}
      {falhou && (
        <FalhouAoCarregar
          mensagem="Não deu para buscar seu plano alimentar agora. Ele continua salvo — assim que a rede voltar, aparece aqui."
          aoTentarDeNovo={() => void recarregar()}
        />
      )}

      {semDieta && (
        <View style={cartao}>
          <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>Sem plano alimentar</Text>
          <Text style={{ color: tema.textoSecundario, marginTop: espacamento.xs }}>
            Seu nutricionista ainda não montou ou ativou um plano.
          </Text>
        </View>
      )}

      {dieta && (
        <>
          <View style={{ ...cartao, gap: espacamento.sm }}>
            <Text style={{ color: tema.textoPrimario, fontWeight: '700', fontSize: tipografia.tamanho.lg }}>
              {dieta.nome}
            </Text>
            <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
              por {dieta.nutricionista.nome}
            </Text>

            <View style={{ flexDirection: 'row', marginTop: espacamento.sm }}>
              {[
                { rotulo: 'kcal', valor: Math.round(dieta.macrosTotais.kcal), alvo: dieta.kcalAlvo },
                { rotulo: 'Prot', valor: Math.round(dieta.macrosTotais.proteinaG), alvo: dieta.proteinaAlvoG },
                { rotulo: 'Carb', valor: Math.round(dieta.macrosTotais.carboidratoG), alvo: dieta.carboAlvoG },
                { rotulo: 'Gord', valor: Math.round(dieta.macrosTotais.gorduraG), alvo: dieta.gorduraAlvoG },
              ].map((m) => (
                <View key={m.rotulo} style={{ flex: 1, alignItems: 'center' }}>
                  <Text
                    style={{
                      color: tema.textoPrimario,
                      fontSize: tipografia.tamanho.lg,
                      fontWeight: '700',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {m.valor}
                  </Text>
                  <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                    {m.rotulo}
                    {m.alvo !== null && m.alvo !== undefined ? ` / ${m.alvo}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {dieta.refeicoes.map((refeicao) => {
            const aberta = expandida === refeicao.id;
            const status = registros[refeicao.id];

            return (
              <View key={refeicao.id} style={{ ...cartao, gap: espacamento.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: aberta }}
                  accessibilityLabel={`${refeicao.nome}, ${Math.round(refeicao.macros.kcal)} calorias`}
                  onPress={() => setExpandida(aberta ? null : refeicao.id)}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tema.textoPrimario, fontWeight: '700' }}>
                      {refeicao.horarioSugerido ? `${refeicao.horarioSugerido} · ` : ''}
                      {refeicao.nome}
                    </Text>
                    <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.sm }}>
                      {Math.round(refeicao.macros.kcal)} kcal · P{Math.round(refeicao.macros.proteinaG)}{' '}
                      C{Math.round(refeicao.macros.carboidratoG)} G{Math.round(refeicao.macros.gorduraG)}
                    </Text>
                  </View>
                  <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.lg }}>
                    {aberta ? '▾' : '▸'}
                  </Text>
                </Pressable>

                {aberta && (
                  <View style={{ gap: espacamento.xs, marginTop: espacamento.xs }}>
                    {refeicao.itens.map((item) => (
                      <View
                        key={item.id}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacamento.sm }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: tema.textoPrimario }}>{item.alimento.nome}</Text>
                          <Text style={{ color: tema.textoSecundario, fontSize: tipografia.tamanho.xs }}>
                            {item.quantidadeG} g
                            {item.alimento.medidaCaseira && ` · ${item.alimento.medidaCaseira}`}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: tema.textoSecundario,
                            fontSize: tipografia.tamanho.sm,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {Math.round(item.macros.kcal)} kcal
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: espacamento.xs, marginTop: espacamento.xs }}>
                  {(['FEITA', 'PULADA'] as const).map((op) => {
                    const marcado = status === op;
                    const cor = op === 'FEITA' ? tema.sucesso : tema.textoSecundario;
                    return (
                      <Pressable
                        key={op}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: marcado }}
                        accessibilityLabel={`Marcar ${refeicao.nome} como ${op.toLowerCase()}`}
                        onPress={() => void marcarRefeicao(refeicao.id, op)}
                        style={{
                          flex: 1,
                          minHeight: alvoToqueMin,
                          borderRadius: raio.md,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: marcado ? cor : tema.borda,
                          backgroundColor: marcado ? cor : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            color: marcado ? tema.fundo : tema.textoSecundario,
                            fontWeight: '600',
                            fontSize: tipografia.tamanho.sm,
                          }}
                        >
                          {op === 'FEITA' ? '✓ Fiz' : 'Pulei'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
