# Inventário de provas

Dois inventários que respondem por contagem, não por impressão: **quais telas não
têm prova nenhuma** e **quais campos de entrada não têm teto**. Os dois nasceram
na auditoria de 02/10/2026, depois de cinco passes que varreram por amostra — e
que por isso deixavam a pergunta "falta alguma?" sem resposta.

O segundo virou prova automática e roda em todo push. O primeiro é um script para
rodar à mão — e desde 08/10/2026 o número certo **é** zero nos dois aplicativos,
o que o transforma na pergunta a fazer sempre que uma tela nova entra.

---

## 1. Telas sem prova

A pergunta é se alguma suíte **importa** o arquivo da tela. Não vale cobrir por
tabela: um teste que exercita a regra em `packages/contracts` não prova a fiação
da tela, e foi exatamente aí que moraram quase todos os defeitos desta auditoria.

```bash
python docs/inventario-de-provas.py
```

O script está logo abaixo, inteiro, para quem preferir colar num arquivo
temporário. Ele imprime o total de telas e a lista das que ninguém importa:

```python
import glob, io, os
BARRA = chr(92)
def norm(f): return f.replace(BARRA, '/')

web = [norm(f) for f in glob.glob('apps/web/app/**/page.tsx', recursive=True)]
mob = [norm(f) for f in glob.glob('apps/mobile/app/**/*.tsx', recursive=True)
       if not f.endswith('_layout.tsx')]

textos = []
for pad in ['apps/web/teste/**/*.ts*', 'apps/web/components/*.test.tsx',
            'apps/mobile/teste/**/*.ts*']:
    for f in glob.glob(pad, recursive=True):
        textos.append(io.open(f, encoding='utf-8').read())
tudo = '\n'.join(textos)

def coberta(c):
    rel = c.replace('apps/web/', '').replace('apps/mobile/', '').replace('.tsx', '')
    for a in [rel, rel.replace('app/', ''), os.path.dirname(rel).replace(BARRA, '/')]:
        if a and a in tudo:
            return True
    return False

for nome, lista in [('WEB', web), ('APP', mob)]:
    sem = [f for f in lista if not coberta(f)]
    print('=== %s: %d telas, %d sem prova' % (nome, len(lista), len(sem)))
    for f in sem:
        print('   -', f)
```

**Medido em 08/10/2026, depois de fechada a pendência 32:** aplicativo 22 de
22; web **46 de 46**. O número certo passou a ser zero, e é por isso que este
script agora vale mais como guarda do que como lista: toda tela nova nasce
acusada até ganhar prova.

**Como saber que o zero é verdadeiro.** "Zero sem prova" é também a resposta de
um script quebrado. A conferência é esconder uma suíte e rodar de novo — ao
tirar `apps/web/teste/telas-de-leitura.test.tsx` ele acusa exatamente as cinco
telas daquela suíte, nominalmente, e nenhuma outra:

```
=== WEB: 46 telas, 5 sem prova
   - apps/web/app/(pro)/ajuda/page.tsx
   - apps/web/app/(pro)/alunos/[alunoId]/comparativo/page.tsx
   - apps/web/app/(pro)/alunos/[alunoId]/treino/[planoId]/imprimir/page.tsx
   - apps/web/app/(pro)/lista-de-compras/page.tsx
   - apps/web/app/(pro)/metodologia/page.tsx
```

Vale repetir isso antes de confiar no zero depois de qualquer mudança no
script ou na organização das pastas.

### O que o script NÃO responde

Se a prova que existe é boa. Uma tela pode ter arquivo de teste e nenhuma
asserção que importe. Para isso o instrumento é outro, e é o de sempre: desfazer
a correção à mão e conferir se a prova fica vermelha. Neste passe, três provas
minhas passaram com o código mutado — todas as três estavam erradas, não o
código.

---

## 2. Campos de entrada sem teto

Este virou prova: `packages/contracts/src/todo-campo-tem-teto.spec.ts`. Ela
percorre **todo** schema exportado por introspecção do zod — inclusive dentro de
listas e de objetos aninhados — e reprova se achar texto ou lista sem limite de
tamanho.

```bash
pnpm --filter @vivio/contracts test
```

**Medido em 02/10/2026:** 166 campos de texto e 20 listas; **32 estavam sem
limite nenhum** e foram corrigidos. A lista de dispensados está vazia.

### O critério, e o erro que ele já cometeu

Contam como teto: `.max()`, `.length()` e os formatos de comprimento fixo
(`uuid`, `cuid`, `datetime`, `date`, `time`, `ip`).

**Não** contam `.regex()` nem `.email()`. A primeira versão da prova aceitava
expressão regular, com o raciocínio de que forma limitada é tamanho limitado — e
a mutação desmentiu na hora: tirar o `.max(72)` da senha não fez a prova falhar,
porque `senhaSchema` tem `.regex(/[0-9]/)`, que não limita coisa alguma. O
formato de e-mail do zod também não tem comprimento máximo.

Com o critério estrito, quinze campos a mais apareceram — todos limitados por
expressão ancorada, nenhum com o teto declarado. Receberam o `.max()` do próprio
formato: dez para `AAAA-MM-DD`, cinco para `HH:MM`, sete para `AAAA-MM`.

### Por que isto vale uma prova, e não uma varredura

Porque o projeto já tinha `LIMITES_DE_TEXTO` e o hábito de usar `.max()`, e mesmo
assim 32 campos passaram. Eles não tinham nada em comum além de ninguém ter
olhado. Corrigir os 32 resolve os 32; o que impede o 33º é a prova — e ela falha
antes de o campo chegar a uma tela.

---

## 3. Texto que o compilador não vê

Terceiro inventário, nascido no passe 9 de 09/10/2026. O SDK fala com o Postgres
por **nomes em texto** — tabelas, colunas, constraints, funções, argumentos,
compartimentos de armazenamento —, e nenhum deles passa pelo compilador. Um erro
de digitação compila, passa em toda prova que não toca o banco, e só aparece em
produção.

A suíte do SDK pega isso, mas fala com o Supabase de verdade e se pula sem
credencial. A conferência estática vive em `packages/banco/prisma`:

| arquivo | o que confere |
|---|---|
| `sdk-x-esquema.ts` / `.spec.ts` | tabela, coluna, embed, dica de constraint, chave de escrita, coluna obrigatória × gatilho, assinatura de `rpc`, privilégio de execução, política por operação, deriva entre `schema.prisma` e migrações |
| `compartimentos.ts` / `.spec.ts` | limite e formatos de mídia: `contracts` × `storage.buckets` |

**Como saber que o "nenhum achado" é verdadeiro.** É o mesmo problema dos outros
dois inventários: uma conferência quebrada também responde "nada". Por isso cada
regra tem uma amostra ruim e uma boa passando pelo mesmo caminho, a varredura do
repositório exige um piso de cobertura (hoje: 196 cadeias, 162 selects, 343
filtros, 70 escritas, 31 rpcs, 251 operações), e a recontagem por regex é
independente da AST. Os pisos sobem e descem de propósito, por quem muda o SDK.

**Para acrescentar uma regra nova**, o caminho é o das existentes: escreva a
amostra ruim primeiro, veja a prova falhar por ela, e só então a regra.
Uma regra cuja amostra ruim nunca foi vista falhando não prova nada.
