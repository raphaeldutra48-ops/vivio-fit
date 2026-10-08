# Inventário de provas

Dois inventários que respondem por contagem, não por impressão: **quais telas não
têm prova nenhuma** e **quais campos de entrada não têm teto**. Os dois nasceram
na auditoria de 02/10/2026, depois de cinco passes que varreram por amostra — e
que por isso deixavam a pergunta "falta alguma?" sem resposta.

O segundo virou prova automática e roda em todo push. O primeiro é um script para
rodar à mão, porque o número certo de telas sem prova não é zero hoje: é uma
decisão de prioridade, e ela mora na pendência 32.

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

**Medido em 08/10/2026:** aplicativo 22 de 22 cobertas; web 34 de 46. As doze
restantes estão nomeadas e em ordem de risco na pendência 32 do
[`PENDENCIAS.md`](PENDENCIAS.md) — três delas são embrulho de catorze linhas em
volta de um componente que JÁ tem prova, e isso está dito lá.

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
