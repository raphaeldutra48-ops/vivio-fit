# Dados de referência

## `taco.json` — Tabela Brasileira de Composição de Alimentos

597 alimentos com composição por 100 g. É a tabela de referência usada por
nutricionistas no Brasil, produzida pelo **NEPA/UNICAMP** (Núcleo de Estudos e
Pesquisas em Alimentação, Universidade Estadual de Campinas), 4ª edição.

Está versionado aqui em vez de ser baixado na hora de propósito: a importação
precisa rodar em produção, e depender de um repositório de terceiro estar no ar
no momento do deploy transformaria uma indisponibilidade alheia em falha nossa.
São 1 MB, uma vez.

**Conferido antes de entrar.** Comparamos os valores contra os 45 alimentos que
já estavam no catálogo, curados a partir da mesma fonte: 26 dos 33 presentes
nos dois bateram dentro de 3 kcal. As diferenças restantes eram do nosso
comparador ingênuo casando textos parecidos — "Morango" com "Biscoito recheado
com morango", "Leite desnatado" com "Leite em pó desnatado" — e não erro de
dado. Número de caloria em app de saúde não entra por confiança no nome do
repositório.

**O que ela não tem**, e por isso o catálogo curado continua:

- **Medida caseira.** "1 concha", "4 colheres de sopa" foram escritos à mão nos
  45 originais. O aluno pensa em concha, não em grama.
- **Suplemento.** Whey, creatina e afins não são alimento e não estão na TACO.

**Atribuição.** A tabela é pública e de uso livre para consulta, mas a fonte
deve ser creditada onde os valores aparecem para o usuário. Antes de a
importação ir para produção, confirme com quem cuida do jurídico se o crédito
que a tela exibe está no formato que a UNICAMP pede.

Origem do arquivo: <https://github.com/marcelosanto/tabela_taco>
