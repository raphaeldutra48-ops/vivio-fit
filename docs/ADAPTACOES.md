# Adaptações

Mudanças de **como o projeto é feito** — não o que ele faz. O `PENDENCIAS.md`
registra dívidas e o que as pagou; aqui ficam as decisões que passaram a valer
para o código seguinte, com o motivo. Sem o motivo, uma regra dessas vira
superstição e alguém a desfaz na primeira pressa.

Todas as datadas de 2026-08-01 saíram do mesmo trabalho: cobrir com teste as
telas que transformam o que o usuário digita (pendência 14b). Três telas —
plano alimentar, adipometria, bioimpedância — e o mesmo defeito nas três.

---

## 1. O defeito que se repetiu, e a forma de não repeti-lo

**O que acontecia.** Campo numérico de formulário é texto no estado — precisa
ser, senão apagar para redigitar vira zero a cada tecla. A conversão para número
morava dentro do componente, escrita à mão:

```ts
Number(texto.replace(',', '.')) || 0
```

`Number('')` é `0`. `Number('abc')` é `NaN`, que o `JSON.stringify` manda como
`null`. Os dois eram enviados, o schema do servidor recusava com 400, e a tela
traduzia isso como uma frase genérica — depois de o formulário inteiro estar
preenchido, e sem dizer qual campo estava errado.

**A forma que passou a valer.** Toda tela que transforma entrada antes de
enviar tem um módulo irmão em `apps/web/lib/<tela>.ts` com quatro papéis:

| Função | Papel |
|---|---|
| leitura | texto → número, **`null`** quando não dá para ler (nunca `0`) |
| `problema*` | mensagem por campo, espelhando a faixa do schema |
| `problemas*` | tudo que impede salvar, em texto, para a lista |
| `corpo*` | monta o corpo, só faz sentido com a lista vazia |

O componente fica só com estado e JSX. E **cada teste de montagem termina em
`<schema>.safeParse`** — a mesma validação que a API aplica. É o que garante
que "o que a tela deixa salvar" e "o que o servidor aceita" não divirjam.

Precedente: `lib/anamnese.ts`, que já fazia isso antes desta leva.

## 2. `lib/campos.ts` — a leitura de campo num lugar só

Depois da terceira tela, a mesma função existia em três arquivos. Passou para
`apps/web/lib/campos.ts`: `numeroDoCampo`, `problemaDeFaixa`,
`problemaDeFaixaOpcional`, `erroVisivel`, `arredondar`.

Os módulos de tela reexportam o que já expunham, então os testes deles não
mudaram uma linha — e continuarem passando é a prova de que a extração não
alterou comportamento.

**Mensagem de campo ilegível.** `problemaDeFaixa` distingue vazio de ilegível:
"preencha este campo" e "use só números". Dizer "preencha" a quem acabou de
digitar ali não ajuda ninguém, e era o que acontecia com campo opcional que
recebia texto.

## 3. Regra clínica e de negócio vive em `packages/contracts`

O `index.ts` do pacote já dizia: *"se um tipo é usado pelo backend E por um
cliente, ele mora aqui. Nada de duplicar definição em apps/\*"*. As equações de
composição corporal violavam isso — Jackson & Pollock e Siri estavam no
`apps/api` **e** copiadas à mão dentro da página de adipometria, porque a tela
mostra o percentual enquanto o profissional digita.

Dois conjuntos de coeficiente clínico para manter iguais. Passaram para
`packages/contracts/src/avaliacao.ts`; o `antropometria.ts` importa e reexporta,
e fica com o que só o servidor faz. **Os 15 testes da API não foram tocados e
continuam passando** — é assim que se prova que uma mudança dessas não mexeu em
nenhum número.

Mesmo raciocínio da regra de consentimento, que virou
`consentimentoVigentePara()` depois de já ter divergido uma vez.

## 4. Prévia na tela não pode ser mais permissiva que o servidor

Quando a tela calcula localmente para não ir e voltar à API a cada tecla, ela
tem de **recusar o que o servidor recusaria**. Duas violações encontradas:

- **Adipometria:** a prévia somava as dobras com `|| 0` e calculava com o que
  houvesse. Com duas de três dobras, a soma sai menor, a densidade sai maior e a
  tela mostrava um percentual **baixo** — plausível e errado. Medido: 9,1% com
  duas dobras contra 13,6% com as três. O servidor sempre recusou meio
  protocolo; a tela é que mostrava assim mesmo.
- **Bioimpedância:** a legenda prometia que a massa magra informada pela balança
  prevalece sobre a derivada, o servidor cumpria, e a prévia mostrava a
  derivada. O número mudava depois de salvar.

Regra: prévia sem dado suficiente mostra **"—"** e diz o que falta. Um número
plausível e errado é pior que nenhum número — mais ainda quando ele vai para a
avaliação de um paciente.

## 5. Onde o erro aparece

- **No campo**, mas só depois que alguém digitou algo (`erroVisivel`). O
  formulário abre vazio; recebê-lo todo vermelho é ranzinza sem informar nada.
- **Em lista acima do botão**, para o que falta. Botão desabilitado sem
  explicação é o pior dos dois mundos: nada acontece e não há o que corrigir.

O componente `Campo` já tinha a prop `erro` com `role="alert"` desde sempre —
ninguém a usava nestas telas.

## 6. O guarda da tela pode ser mais rígido que o schema

Texto ilegível num campo **opcional** vira ausência no corpo, e o schema aceita
de bom grado — o campo simplesmente não vai. Mas alguém digitou ali: enviar sem
ele seria descartar em silêncio o que a pessoa escreveu. A tela para e pede a
correção. Há teste nomeando esse caso, para ninguém "consertar" a divergência
depois achando que é bug.

## 6b. Página que explica a regra é gerada da regra

*(2026-08-02, leitor de exames)*

A `/metodologia` lista as 20 faixas, as fontes e a força de cada fonte — e é
**construída de `REFERENCIAS`**, a mesma tabela que classifica os exames.
Escrita à mão, ela divergiria, e uma página de metodologia que mente é pior que
nenhuma. Há teste montando o agrupamento de fontes a partir da tabela, para a
geração não quebrar em silêncio.

Mesmo princípio da equação de composição corporal e da regra de consentimento:
a explicação e a execução saem da mesma fonte.

## 6c. Campo em branco nem sempre é campo faltando

*(2026-08-02, leitor de exames)*

Nas telas de avaliação, campo vazio é dado que falta e a lista acima do botão
cobra. **No exame é o contrário**: um laudo quase nunca traz os 20 marcadores,
e cobrar os ausentes transformaria a tela numa lista de reclamações. Lá,
`problemaDoMarcador` devolve `null` para vazio e só reclama do que foi digitado
e não dá para ler.

A regra geral que sobrou das duas: **em branco é ausência**; o que muda entre
telas é se a ausência importa. Decidir isso é por tela, não por biblioteca.

## 7. Adaptações de teste

- **`clearMocks: true` no `vitest.config.ts`.** Sem ele o histórico de chamadas
  de um `vi.fn()` sobrevive entre testes, e `mock.calls[0]` passa a ler o envio
  do teste anterior — foi assim que um teste "provou" 120 g em vez de 152,5.
  Irmão do `afterEach(cleanup)` que já existia para o DOM: mesma classe de
  vazamento, mesmo lugar.
- **Teste de render de página mora em `apps/web/teste/`**, não ao lado da
  página. Os caminhos do App Router têm `(pro)` e `[alunoId]`; parêntese e
  colchete são sintaxe de glob, e um `.test.tsx` ali dentro corre o risco de
  nunca ser coletado. Teste de **componente** continua colocalizado.
- **`getNodeText` junta só os nós de texto diretos.** Um `<p>` com
  `25%<span> de gordura</span>` casa como `"25%"`, não como a frase inteira —
  então `getByText(/de gordura/)` acha o `<span>`, e às vezes também um
  parágrafo de texto corrido da tela. Mirar o elemento certo e subir para o pai,
  ou desempatar com `selector`.
- **Fixture com `cuid` de verdade.** Vários schemas usam `z.string().cuid()`;
  `'aluno-1'` é recusado e o teste falha por um motivo que não é o testado.

## 8. Adaptações de ambiente (Windows, esta máquina)

- **pnpm só existe via corepack**, e isso quebra o Turborepo: o `turbo` procura
  o executável `pnpm` no PATH e responde `Unable to find package manager binary`.
  Shims instalados sem UAC em `C:\Users\ADMIN\AppData\Local\pnpm-shim` com
  `corepack enable pnpm --install-directory <dir>`. Em cada comando:

  ```
  $env:PATH = "C:\Program Files\nodejs;C:\Users\ADMIN\AppData\Local\pnpm-shim;$env:PATH"
  ```

- **`.claude/launch.json` aponta para o binário do corepack, não para `pnpm`.**
  O servidor sobe a partir da pasta *pai* do repositório, onde não há
  `package.json` — então o corepack resolve "a última versão" em vez da fixada
  em `packageManager`, e trava tentando baixá-la. Chamar
  `node <cache>/pnpm/11.17.0/bin/pnpm.cjs` contorna a resolução inteira.

- **Docker não existe aqui.** Nenhuma imagem foi construída (pendência 18); o
  primeiro deploy no Railway é o teste.

---

## Resumo do que estas adaptações renderam

| Tela | Defeitos encontrados | Testes novos |
|---|---|---|
| Plano alimentar | 4 | 32 |
| Adipometria | 4 + equação duplicada | 33 |
| Bioimpedância | 3 + prévia que contrariava a própria legenda | 26 |

Suíte da web: **55 → 146 testes**. API: 15 testes de antropometria intactos,
provando que a equação não mudou ao mudar de lugar.
