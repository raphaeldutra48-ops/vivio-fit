# Parâmetro de qualidade — Prime Coaching

Levantado em 21/08/2026 a partir de 25 telas do painel profissional do Prime App
(app.primecoaching.com.br), enviadas pelo Raphael como referência.

Este documento existe para uma coisa: **transformar "quero parecido com aquele"
em lista verificável**. Sem ele, "melhorar o visual" vira opinião, e opinião não
tem critério de pronto.

Regra que vale para tudo aqui: copiar o **padrão**, nunca a tela. O Prime é uma
plataforma de venda de consultoria; o Vívio é o cuidado em volta de um aluno.
Copiar a tela do Prime traria uma tela de faturamento para um app que não fatura.

---

## 1. O que o Prime faz melhor — e o Vívio precisa ter

### 1.1 Existe uma tela de resumo. No Vívio não existe.

O profissional do Prime cai em `/dashboard`: saudação com o nome, data, um
indicador "ao vivo", e depois faixas nomeadas — PRIMEIROS PASSOS, OPERACIONAL,
FINANCEIRO, NEGÓCIO.

O profissional do Vívio cai em `/alunos`, que é uma lista. Ele abre o app e não
sabe o que fazer hoje; precisa entrar aluno por aluno para descobrir.

**É a maior lacuna do app.** Detalhada na seção 3.

### 1.2 Estado vazio é uma tela, não uma frase

Toda tela sem dado no Prime traz ícone + título + uma linha de explicação + botão:

> 🧑‍🤝‍🧑 **Nenhum cliente encontrado**
> Adicione um cliente pra começar a prescrever treinos, dietas e acompanhar a evolução.
> `+ Cadastrar cliente`

O Vívio hoje escreve `Carregando…` e listas que simplesmente não renderizam. Quem
chega numa tela vazia não sabe se está quebrado, se está carregando, ou se é
assim mesmo.

### 1.3 Cada métrica explica o que é

Quase todo título de número no Prime tem um ⓘ ao lado. "Ticket médio", "LTV
médio", "Expectativa de renovação" — termos que o usuário não é obrigado a saber.

O Vívio tem o instinto certo em um lugar só (a nota do 1RM: *"Estimativa pela
fórmula de Epley […] não é um teste de carga máxima"*). Falta virar componente e
aparecer em todo número que não se explica sozinho.

### 1.4 "Ocultar valores"

Um botão em cada bloco financeiro que troca os números por `•••`. Serve para
quem abre o painel num café, numa academia, com gente ao lado.

**No Vívio isso vale mais do que no Prime**, e por um motivo melhor: o que está
na tela não é faturamento, é dado de saúde de terceiro. Um personal que abre a
ficha da aluna no meio da academia expõe peso, percentual de gordura e condição
clínica dela para quem passar atrás. Detalhado em 4.1.

### 1.5 Cada cartão tem o próprio período

No Prime, "Vendas por Período", "Ticket médio" e "Expectativa de Renovação" têm
cada um seu seletor (Esta semana / Agosto 2026 / Próximos 30 dias) e cada um
mostra a comparação — "— 0% vs semana passada".

No Vívio o período é um só para a ficha inteira (30/90 dias). Perguntas
diferentes têm janelas diferentes: adesão se olha na semana, composição corporal
no trimestre.

### 1.6 Onboarding: checklist + tour

- Cartão "Deixe tudo pronto pra atender seus clientes", com contador `0 de 4`,
  barra de progresso, um vídeo curto por passo, e cadeado nos passos ainda
  bloqueados.
- Tour guiado de 10 etapas, um balão ancorado em cada item do menu, com
  "Pular tour / Voltar / Próximo".

O Vívio não tem nada disso. Um personal que se cadastra hoje vê uma lista de
alunos vazia e nenhuma indicação de por onde começar.

### 1.7 Biblioteca de exercícios: miniatura, idioma, ações

Cada linha traz vídeo em miniatura com play, nome, grupo muscular, **bandeira do
idioma** (BR/ES/US — o mesmo exercício cadastrado em três línguas) e um menu
`···`. No topo: Exportar lista, Sincronizar exercícios, Adicionar exercício.
Exercício sem vídeo mostra um ícone de placeholder — nunca um vazio.

No Vívio, ~30 dos 159 exercícios têm imagem, e o resto aparece como nome solto.
Foi exatamente a queixa do Raphael: *"vem com o nome sem imagem"*.

### 1.8 Alimentos: a fonte é uma aba com contador

```
● 341 Meus alimentos   ● 597 TACO   ● 5.589 TBCA
```

Três coisas de uma vez: separa o que é curado do que é tabela oficial, mostra o
tamanho de cada base, e deixa filtrar por fonte.

O Vívio tem 597 da TACO — **o mesmo número**, o que confirma que os dois partiram
do mesmo conjunto. Só que a fonte não aparece na tela, e a TBCA (USP, 5.589
itens) não foi importada. É uma diferença de 5.589 alimentos.

### 1.9 Importação por IA com medidor de uso

`Uso da IA neste mês — 0 / 3 importações` com barra de progresso, e um aviso
honesto: *arquivo fora do padrão consome a cota mesmo se o plano não for criado*.

O Vívio tem o leitor de dieta e **nenhum medidor**. A chamada custa dinheiro
real da conta Anthropic e ninguém vê o consumo — nem o profissional, nem você.

### 1.10 Menu lateral

Recolhível pelo `‹`, seções nomeadas (PRINCIPAL / GESTÃO / CRESCIMENTO), e o item
ativo pintado como retângulo azul cheio com o texto em branco.

O Vívio marca o ativo com barra à esquerda + fundo levemente diferente. Funciona,
mas some numa varrida rápida — e o menu do Vívio é bem mais longo.

### 1.11 Biblioteca como página-índice

"Dieta e protocolo" abre quatro cartões grandes com ícone (Meus alimentos,
Minhas fórmulas, Meus cardápios, Refeições predefinidas) e uma "Central de ajuda"
embaixo. Ninguém cai direto numa tabela de 6.000 linhas.

---

## 2. Onde o Vívio já está à frente — e não pode perder

Vale registrar, porque na pressa de "ficar parecido" é o que se joga fora primeiro.

| | Prime | Vívio |
|---|---|---|
| **Leitura de dieta** | Processa e cria o plano. Erro consome cota | Tela de conferência item a item, com candidatos do catálogo e **nenhuma sugestão quando há empate** |
| **Camada clínica** | Não existe | Exames com faixas, condições de saúde, alertas cruzados por papel |
| **LGPD** | Não aparece | Consentimento por escopo, e a tela ensina o profissional a **pedir** — o caminho exato que o aluno tem de percorrer |
| **Número sem lastro** | "R$ 0,00 — 0% vs semana passada" sem nenhuma venda | `null` em vez de zero: sem medição, sem número |
| **Semana sem treino** | — | Aparece como barra zero, não some do gráfico |
| **1RM** | — | Declarado como estimativa de Epley, não teste de carga |

O Prime acerta em um caso ("Sem período anterior pra comparar") e erra no
vizinho, mostrando "— 0%" como se fosse medição. O Vívio é consistente nisso, e
é a coisa mais valiosa que ele tem.

---

## 3. A diferença que define o produto

O Resumo do Prime responde **"quanto eu faturei?"**. Cinco dos seis blocos são
dinheiro: vendas, ticket, renovação, LTV, chargeback, meta mensal.

O Resumo do Vívio tem que responder **"quem precisa de mim hoje?"**.

Nenhum dos oito produtos que o Raphael mandou tem isso, porque nenhum deles tem
médico dentro. É o espaço vazio do mercado brasileiro:

```
OPERACIONAL          →  ACOMPANHAMENTO
Atendimentos pendentes   Alunos sem treinar há mais de X dias
Feedbacks pendentes      Check-ins sem resposta
Conversas não lidas      Alertas clínicos não reconhecidos
Desistências (30 dias)   Exames fora da faixa aguardando leitura
                         Consentimentos pendentes travando o trabalho
```

A última linha é a que nenhum concorrente pode copiar sem reescrever o modelo de
dados: **o profissional descobre no resumo que está bloqueado**, em vez de
descobrir ao abrir a ficha e encontrar o botão desligado.

---

## 4. Ideias do Prime que ficam melhores no Vívio

### 4.1 Modo discreto (o "Ocultar valores" virado para saúde)

O Prime esconde dinheiro. O Vívio esconde **peso, variação de peso, dias com
dor, título de alerta clínico e os gráficos de composição corporal**.

O **nome do aluno fica visível** de propósito. Escondê-lo deixaria a tela
inutilizável exatamente quando o modo está ligado: o profissional precisa saber
a quem a linha se refere para poder agir. O que constrange é o dado de saúde ao
lado do nome, não o nome.

Sem atalho de teclado. Toda combinação razoável colide com algo — `Ctrl+Shift+O`
e `Ctrl+Shift+M` são do navegador, e letra sozinha é tecla de navegação rápida
de leitor de tela. Um botão fixo no cabeçalho resolve em um clique.

Argumento de venda que o Prime não tem como usar: *"o dado da sua aluna não
aparece para quem passa atrás de você na academia"*.

### 4.2 Medidor de IA que mostra custo, não só cota

O Prime mostra `0 / 3`. O Vívio pode mostrar quantas leituras foram feitas, o
que sobrou, e — no painel do administrador — o custo real acumulado.

### 4.3 Checklist de primeiros passos ligado ao vínculo

O do Prime é sobre montar a loja: criar produto, cadastrar cliente, criar treino,
personalizar conta.

O do Vívio é sobre **destravar o cuidado**: convidar o aluno → o aluno aceitar →
o aluno autorizar os escopos → primeira anamnese → primeiro plano. Os passos 2 e
3 não dependem do profissional, e o checklist tem que dizer isso, senão ele fica
esperando um botão que nunca vai acender.

---

## 5. O que NÃO copiar

- **Afiliados, cupons, carrinho abandonado, área de cursos.** É plataforma de
  infoproduto. Cabe num roadmap comercial, não numa release de qualidade.
- **Paywall no primeiro acesso.** O Prime abre a tela de planos antes do app.
- **"— 0%" sem dado.** É o oposto da regra do Vívio.
- **Barra de meta de faturamento no topo** (`R$0 ▬▬▬ R$10K`). Ocupa o lugar mais
  nobre da tela com o assunto errado para um app de saúde.

---

## 6. Fila de execução

Ordem por relação valor/esforço. Cada item só sai de "pendente" com o critério
de aceite cumprido.

| # | Item | Critério de aceite | Estado |
|---|---|---|---|
| 1 | `EstadoVazio` e `Explicacao` (ⓘ) | Componentes com teste; nenhuma lista vazia sem ícone, frase e saída | **feito** |
| 2 | Modo discreto | Alterna, persiste, e o valor real continua saindo na impressão | **feito** |
| 3 | Resumo do profissional (`/resumo`) | Vira a tela inicial; nenhum número sem lastro; consultas constantes no nº de alunos | **feito** |
| 4 | Menu: ativo visível | Par de cores já medido em `paresDeContraste` | **feito** |
| 5 | Menu recolhível | Preferência persistida, como o `‹` do Prime | pendente |
| 6 | Fonte visível no catálogo de alimentos | Contadores por fonte, filtro, e crédito à UNICAMP na tela | pendente |
| 7 | Medidor de uso da IA | Cota e consumo visíveis antes de enviar arquivo | pendente |
| 8 | Primeiros passos | Distingue o que trava no profissional do que trava no aluno | pendente |
| 9 | Importar TBCA | +5.589 alimentos, sem duplicar o que a TACO já trouxe | pendente |

Fora desta fila e ainda pendentes por dependerem do Raphael: rotação da senha do
Neon, armazenamento externo das fotos (hoje apagadas a cada deploy), revisão
profissional das faixas de exame, e a decisão (a)/(b) do assistente de IA.

---

## 7. Desempenho e estado — o que foi corrigido

Levantamento feito sobre seis critérios pedidos pelo Raphael (fluidez, tempo de
resposta, uso de recursos, design visual, acessibilidade, consistência). O que
saiu dele, em ordem de gravidade:

| Defeito | Onde estava | Correção |
|---|---|---|
| **Treino em andamento vivia só na memória.** App encerrado em segundo plano no meio do treino = quarenta minutos perdidos, sem aviso | `execucao/[sessaoId].tsx` | Rascunho gravado no aparelho, com faixa de retomada e saída para começar do zero. Regra de validade em `contracts`, com 11 testes |
| **N+1 ao concluir treino.** Uma consulta por exercício, sem `take` e sem corte de data — no caminho mais quente do app | `execucoes.service.ts` | Duas consultas em paralelo, independentes do tamanho do treino. Sem mudar a regra: recorde continua sendo "melhor de todos os tempos" |
| **Sondagens nunca paravam.** 30 s e 15 s batendo na API com o celular no bolso | `sincronizacao.tsx`, `chat.tsx` | Gancho `useSondagem`: pausa fora da frente, busca na hora ao voltar. Versão web usa visibilidade da página |
| **Três componentes definidos dentro do render.** Cada tecla na busca remontava os 159 exercícios | `exercicios/page.tsx`, `MenuLateral.tsx`, `MetasDoAluno.tsx` | Movidos para o escopo do módulo, dependências como props |
| **Falha de rede parecia dado vazio** em 4 das 5 abas — e mentia: "0 treinos" para quem tem 50, "seu personal não montou plano" para quem está sem sinal | abas do aplicativo | Três estados separados (carregando / erro / pronto), com `ErroApi.status === 404` distinguindo "não existe" de "não consegui perguntar" |
| **ⓘ com 18 px**, abaixo do mínimo de 24 do WCAG 2.2 | `ui.tsx` | 24 px. E o balão, que estourava a borda esquerda no celular, ganhou deslocamento medido e teste |
| **Corrida em `/relatorios`** — trocar 30 → 90 dias mostrava números de um período com o botão do outro marcado | `relatorios/page.tsx` | Guarda de cancelamento |

## 8. Catálogo de exercícios — o que veio da lista deles

Em 24/08/2026 o Raphael conseguiu a exportação da biblioteca de exercícios do
Prime: 752 linhas, que são ~250 exercícios repetidos em português, espanhol e
inglês, com link de vídeo em 711 delas.

**Os vídeos ficaram de fora, e é decisão, não esquecimento.** Os 711 links
apontam todos para `iframe.mediadelivery.net/embed/693551/…` — Bunny.net
Stream, a conta paga do próprio Prime. São demonstrações produzidas por eles.
Copiar aquilo para cá é violação de direito autoral e motivo de remoção da loja
por notificação, que é o oposto do objetivo. O cabeçalho de
`exercicios-globais.ts` já dizia isso desde o começo: *"catálogo copiado de
outro app carrega licença junto, e isso reprova na loja"*.

**Os nomes, sim.** "Supino reto com barra" é vocabulário de academia, não
invenção de ninguém. Comparando os 256 nomes em português contra os nossos —
com `pontuarCandidato`, o mesmo comparador do leitor de dieta:

| | |
|---|---|
| Já tínhamos, com outra grafia | 44 |
| Variações do que já existia | 80 |
| Sem correspondência | 132 |

Dos 132, **58 entraram**. O resto era duplicata que o comparador por palavras não
pegou: "Front Squat" é o nosso "Agachamento frontal", "Pec Deck" é o "Peck deck
(voador)", "Paralelas" é o "Mergulho no paralelo". Despejar os 132 teria
inchado o catálogo com sinônimos — e catálogo com sinônimo quebra o histórico de
carga, que é indexado por exercício.

As 58 instruções foram escritas do zero, na regra da casa: cada uma diz **o erro
que se comete**, não descreve o movimento.

Dois buracos reais que a comparação revelou, e que não eram variação de nada:

- **Antebraço** — nenhum exercício. Entraram flexão e extensão de punho, que é
  o que costuma faltar em quem tem epicondilite
- **Alongamento e mobilidade** — nenhum. Entraram cinco alongamentos e três de
  mobilidade

Catálogo global: **156 → 214** no arquivo (217 no banco, com os do wger).

⚠️ **A cobertura visual piorou em proporção:** 30 imagens para 214 exercícios,
contra 30 para 156. O catálogo ficou mais completo em nome e mais vazio em
imagem. Vídeo continua em zero.

### Números medidos

Contra o banco na nuvem a partir de uma conexão residencial, o que **infla tudo**:

```
  427 ms   /me           ← uma consulta: é o piso da rede, não do código
 1454 ms   /resumo       ← seis consultas
 1030 ms   /exercicios?limit=100
```

Em produção a API fica ao lado do banco e esse piso despenca. A métrica que
importa aqui é **quantidade de consultas**, e é ela que foi atacada.
