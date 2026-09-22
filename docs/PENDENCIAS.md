# Pendências

Dívidas conscientes assumidas durante a construção. Cada uma tem o passo em que
deve ser paga. Não apagar item sem resolver — mover para "Resolvidas".

## Abertas


### 7. nodeLinker hoisted no workspace inteiro
**Assumida em:** C4
**Estado:** `pnpm-workspace.yaml` usa `nodeLinker: hoisted` por causa do Metro.
**Consequência:** o monorepo perde o isolamento estrito do pnpm — um pacote passa
a conseguir importar dependência que não declarou, e o erro só aparece no build
de produção.
**Mitigação atual:** `pnpm build` roda os 7 workspaces no CI e pegaria o caso, e
`apps/web/teste/versoes-do-react.spec.ts` cobre a consequência mais cara (duas
cópias de React), que era a pendência 8.
**Alternativa futura:** isolar o mobile em workspace próprio, ou reavaliar quando
o Metro melhorar o suporte a symlinks.

### 9. Offline: WatermelonDB trocado por cache + fila
**Assumida em:** C6
**Estado:** o modo offline usa `AsyncStorage` (cache do plano ativo e das
séries anteriores + fila de saída), não WatermelonDB como o plano previa.
**Por quê:** WatermelonDB exige *dev client* nativo — quebraria o Expo Go — e é
um motor de sincronização relacional bidirecional. A Fase 1 precisa de cache de
leitura e fila de escrita; a parte difícil (idempotência) já está no servidor.
**Reavaliar em:** quando houver edição offline de dados que o profissional também
edita (dieta, anotações), aí a resolução de conflito justifica o peso.

### 10. Lembrete não chega ao aparelho — só à caixa de avisos do app
**Assumida em:** C8 · **Atualizada em:** 2026-09-15
**Estado:** o disparo funciona e roda no banco (`42-disparo-de-lembretes.sql`,
`pg_cron` a cada minuto): horário no fuso do aluno, dias da semana, uma vez por
dia por tipo, "não lembrar quem já treinou". O aviso aparece na lista de
notificações do app. **Não há entrega por push**: o aplicativo nunca registra
token de aparelho (não usa `expo-notifications`), e a API só tinha um driver que
escrevia no log e marcava "enviada". A linha agora diz a verdade: `enviadaEm`
nulo e `erro` = `SEM_DISPOSITIVO` ou `PUSH_NAO_CONFIGURADO`.
**Pagar em:** quando o app for ter push de verdade. Passos: `expo-notifications`
no app para pedir permissão e registrar o token (`registrar_dispositivo` já
existe), e a entrega pela API de push da Expo — por Edge Function ou `pg_net`
chamada ao fim do disparo, marcando `enviadaEm` e desativando token recusado.
O build nativo do app precisa ser refeito.

### 12. Suite de testes lenta contra o Neon gratuito
**Assumida em:** Fase 2 (chat)
**Estado:** a suite leva ~4 minutos. Sob carga, uma requisicao chega a 10s
porque o compute gratuito do Neon escala a zero e limita. O timeout do vitest
subiu para 90s so para lentidao de infra nao ser lida como bug.
**Sintoma ja observado:** dois testes falharam por timeout numa rodada e
passaram na seguinte, sem mudanca de codigo.
**Pagar em:** junto com a pendencia 2 — branch de teste no Neon (a ligacao ja
esta pronta, ver la), e depois Postgres local no CI, que tira a rede do caminho
e e o que de fato resolve a lentidao.

### 14b. As outras telas continuam sem teste de render
**Assumida em:** dívidas técnicas (o que sobrou da pendência 14)
**Estado:** jsdom e testing-library estão instalados e o `EditorDeItensPrescritos`
está coberto, mas as demais telas seguem verificadas só operando o navegador.
**Como escolher a próxima:** cobrir onde a tela **transforma** o que o usuário
digita antes de mandar (é onde o bug mora), não onde ela só exibe. Formulário
que só passa `value` adiante não precisa de teste de render — o typecheck já
cobre.
**Já coberto desde então:** a reordenação das duas telas (`Reordenavel.test.tsx`),
a montagem do corpo do modelo de anamnese (`lib/anamnese.spec.ts`), o editor de
plano alimentar (`lib/dieta.spec.ts` + `teste/montar-dieta.test.tsx`) e a
adipometria (`lib/adipometria.spec.ts` + `teste/adipometria.test.tsx`) — as duas
últimas eram as candidatas anteriores e as duas cobraram o preço previsto. Ver as
resolvidas de 2026-08-01.
**A classe de defeito acabou em 2026-08-04.** Não existe mais `|| 0` nem
`Number(e.target.value)` gravado no estado em nenhuma tela de formulário. As
seis que transformam entrada antes de enviar — plano alimentar, adipometria,
bioimpedância, receitas, refeições e montagem de treino — passaram todas para o
formato `lib/<tela>.ts`, com o estado guardando **texto**.

**A cobertura fechou em 2026-08-05.** As três telas que tinham só teste de
unidade da regra ganharam teste de render da fiação: `teste/montar-treino.test.tsx`
(11), `teste/refeicoes-salvas.test.tsx` (10) e `teste/receitas.test.tsx` (9). As
seis telas que transformam entrada agora têm os dois lados.

O critério de escolha do que testar foi **o que a regra não consegue ver**, e não
repetir a regra pela porta da frente:
- **Treino:** três sessões dividindo os mesmos manipuladores. `adicionarExercicio`
  e `alterarItem` fecham sobre `sessaoAtiva`; errar o índice ali escreve na sessão
  errada sem quebrar nenhum teste de unidade, porque a regra recebe a sessão já
  escolhida.
- **Refeições:** o mesmo formulário serve a criar e a editar, distinguidos por
  `editando` valer `''` na criação e o id na edição — e o `if (editando)` conta com
  `''` ser falso. E a volta do servidor lê `porcoes` ou `quantidadeG` conforme o
  tipo do item; ler o campo errado põe um número plausível no lugar certo.
- **Receitas:** o `jaEscolhidos` passado à `BuscaDeAlimento`. A lista usa
  `key={i.alimentoId}`, então o mesmo alimento duas vezes daria chave repetida no
  React e as gramas passariam a ser escritas na linha errada.

Os três casos acima foram verificados quebrando a fiação de propósito e conferindo
que o teste acusa — teste que passa de qualquer jeito não é cobertura, é enfeite.

**Uma instância remanescente, benigna:** `financeiro/page.tsx:226` faz
`setRepetir(Math.max(1, Number(e.target.value)))`. O `Math.max` impede zero e
`NaN` de chegarem ao servidor, então não há bug de dado — o custo é de uso:
apagar o campo faz ele saltar para `1` sozinho. Vale arrumar junto da próxima
mexida no financeiro, não isolado.

O padrão inteiro está em [ADAPTACOES.md](ADAPTACOES.md).

### 15. E-mail de produção — PAGA em 2026-08-06
**Assumida em:** verificação de e-mail
**Estado:** **resolvida.** Resend configurado, domínio `viviofit.com.br`
verificado (DKIM + SPF + MX + DMARC no registro.br, conferidos por consulta a
dois resolvedores públicos), e o primeiro envio real caiu na **caixa de
entrada** — não no spam, o que para domínio novo é melhor que o esperado.
`EMAIL_SEM_ENTREGA` foi apagada; a API agora recusa subir sem entrega de
e-mail.

**A pedra do caminho, que vale lembrar:** o primeiro teste falhou com
`Connection timeout` no SMTP. O **Railway bloqueia saída na porta 587**, como
quase toda plataforma faz contra abuso de spam — nenhuma chave nem DNS
resolveria. O envio passou para a **API HTTP do Resend**, na 443. Se algum dia
outro serviço de e-mail entrar aqui, começar por HTTP e não por SMTP.

**Configuração final:** só `RESEND_API_KEY` (a chave crua) e `EMAIL_REMETENTE`.
`SMTP_URL` continua existindo para outro provedor e ganha da chave.

**O que foi feito de código no caminho:**
- A API **recusa subir** em produção sem forma de enviar ou sem
  `WEB_PUBLIC_URL` válida (`src/entrega-de-email.ts`), porque o sintoma dessa
  configuração faltando é "o site não funciona", relatado dias depois por quem
  não conseguiu entrar. A escapatória `EMAIL_SEM_ENTREGA=true` continua no
  código para um eventual intervalo sem provedor, e é explícita para aparecer
  na lista de variáveis de quem for olhar.
- O nome do cadastro deixou de entrar cru na mensagem
  (`src/modules/auth/mensagem-verificacao.ts`). Quem se cadastra **ainda não
  provou ser dono do endereço** — é o que este e-mail vai verificar. Dava para
  cadastrar o e-mail de outra pessoa, escolher o `nome`, e a vítima receberia,
  assinado pelo nosso domínio, um parágrafo ou um link escrito pelo atacante.
  Isso só passaria a valer no dia em que o e-mail saísse de verdade.
- `src/ferramentas/enviar-email-teste.ts` confere a configuração sem sujar a
  base com cadastro de teste, e distingue "não conecta" de "o provedor recusou
  a mensagem" — foi ela que identificou o bloqueio de porta em vez de nos
  deixar trocando a chave à toa. Fica em `src/` porque a imagem de produção só
  carrega o compilado, e o contêiner é o único lugar onde a chave existe.
  Aciona-se por `EMAIL_TESTE_PARA` no Railway, como as outras tarefas.
- A chave é **censurada em qualquer texto que vá para o log**, inclusive no
  texto de exceção que vem de fora e que não dá para controlar.

**Como verificar de novo, se um dia desconfiar:** definir `EMAIL_TESTE_PARA` no
Railway, fazer deploy, ler o log — e depois **apagar a variável**, ou todo
deploy manda e-mail.

### 19. Mídia em disco de contêiner é apagada a cada deploy
**Assumida em:** preparação do deploy (dívida que existia sem estar registrada)
**Estado:** o driver de armazenamento padrão grava em `MEDIA_DIR`, no disco
local. Em desenvolvimento isso é o certo. No Railway o sistema de arquivos do
contêiner é efêmero: **cada deploy apaga as fotos de evolução dos alunos**, e o
banco fica com registros apontando para arquivos que não existem mais.
**Por que só apareceu agora:** o driver foi feito com a abstração pronta para
S3 desde o começo, e em desenvolvimento nada some — o problema só existe onde o
contêiner é recriado.
**O que já está feito (2026-08-02):** `ArmazenamentoR2` implementa a interface
`Armazenamento` com URL assinada de curta duração para leitura e escrita, e
`escolherDriverDeMidia` decide o driver **por presença de configuração**, não
por `NODE_ENV` — quem aponta um bucket quer usá-lo, inclusive localmente para
conferir a credencial antes do deploy. Nenhum serviço mudou: era para isso que
a interface existia. Em produção sem R2 o app sobe (derrubá-lo por causa de
mídia seria pior) e registra no boot, em nível de erro, que **as fotos serão
apagadas no próximo deploy** — mesmo tratamento que o `PROXY_HOPS` recebeu.
**O que falta (ação sua, precisa da conta Cloudflare):** em
[dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → *Create bucket*
(10 GB grátis, sem cobrança de egresso, que é o que pesa quando o app serve
imagem toda vez que alguém abre a evolução). Depois **Manage R2 API Tokens** →
criar token com leitura e escrita nesse bucket. As quatro variáveis vão direto
nas Variables do Railway:

```
R2_BUCKET=<nome do bucket>
R2_ACCOUNT_ID=<o hex que aparece no painel do R2>
R2_ACCESS_KEY_ID=<do token>
R2_SECRET_ACCESS_KEY=<do token>
```

O bucket fica **privado** — a entrega é sempre por link assinado. Não marque
acesso público.
**Como verificar:** subir uma foto de evolução, fazer um deploy novo e abrir a
foto de novo. Antes disso o log do boot já diz qual driver está em uso.
**Ainda aberto até o bucket existir.** A pendência 22 (arquivo do exame) se paga
junto: o upload do laudo usa o mesmo armazenamento.

**Atualização em 2026-09-10 — conferido nas Variables do Railway:**

- **Paga no Railway, pelo volume — e não pelo R2.** A API continua lá
  (`x-railway-edge: gru1`), com o volume `@vivio/api-volume` montado em
  `/dados/midia` e `MEDIA_DIR=/dados/midia`. A mídia no disco local **sobrevive
  ao deploy**. R2 **não** está configurado.
- **O aviso de boot mentia desde 01/09.** `midiaEmDiscoPersistente()` tinha sido
  trocada por um `return false` fixo, na premissa de que a API já estava na
  Cloudflare. Todo boot de produção anunciava, em nível de erro, que as fotos
  seriam APAGADAS no próximo deploy — com o volume de 5 GB no lugar. A checagem
  do volume voltou, com os testes de caminho que tinham sido apagados junto.
- **O importador do wger passou a gravar pelo driver**
  (`src/ferramentas/importar-wger.ts`; a interface `Armazenamento` ganhou
  `gravar` e `existe`) e é idempotente pelo ARQUIVO, não pela coluna. No volume
  isso dá na mesma que antes; importa no dia da troca de armazenamento — rodar
  o importador é o que repovoa o destino novo.
- **Diagnóstico sem gravar nada:** `IMPORTAR_WGER=true` e `SIMULAR=true` nas
  Variables do serviço `api`, e deploy. O log diz qual driver está em uso e
  quantas imagens do banco não estão no armazenamento.

**Atualização em 2026-09-11 — resolvida pelo Storage do Supabase.** O destino
escolhido foi o Storage, e não o R2, por um motivo que o R2 não resolvia: quem
envia o arquivo agora é o **cliente**, e quem decide se ele pode é a política do
compartimento, com a sessão de quem enviou. No R2 essa conferência continuaria
sendo trabalho da API — que é justamente a peça que está saindo.

- Seis compartimentos (`32-armazenamento.sql`), cada um com teto de tamanho e
  lista de formatos, todos privados menos o `catalogo`.
- O endereço do arquivo é `<compartimento>/<dono>/<arquivo>`: a primeira pasta é
  o dono, e é ela que a política lê. Nenhuma linha do banco precisou ser
  reescrita — a chave que ele guardava já tinha essa forma.
- O driver da API passou a ser o Supabase quando `SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE` estão presentes (`ArmazenamentoSupabase`), à frente do
  R2. Não é preferência: é onde o cliente escreve, e as duas pontas precisam
  olhar para o mesmo lugar.
- `midiaEmDiscoPersistente()` continua de pé para quem rodar a API sozinha, e
  responde `false` quando o volume some — o aviso de boot volta a ser verdadeiro
  sem ninguém mexer em nada.

**O que resta é a mídia já gravada no volume do Railway.** As figuras do acervo
foram para o `catalogo` (`subir-catalogo`, 32 arquivos, nenhuma chave apontando
para arquivo ausente). Foto de evolução e laudo de aluno, se houver alguma no
volume, não foram movidas — o banco de produção tem só as sete contas de
semente, então provavelmente não há nenhuma; conferir antes de desligar o
serviço, porque desligá-lo leva o volume junto.

### 20. Confirmação automática de pagamento exige gateway
**Assumida em:** Receba Fácil
**Estado:** o app **gera** o PIX copia e cola (BR Code do BACEN, padrão aberto),
mas **não sabe quando o pagamento cai**. Sem gateway não existe webhook, então o
profissional confere no banco e marca como recebido no Controle financeiro.
**Por que resolve mesmo assim:** o público-alvo cobra por PIX direto. O dinheiro
vai do aluno para a conta dele, sem a plataforma intermediar, sem taxa e sem
CNPJ — o que também evita a plataforma virar instituição de pagamento.
**Se um dia precisar de confirmação automática:** conta em gateway (Pagar.me,
Asaas), webhook de confirmação e conciliação pelo identificador que o BR Code já
carrega — o modelo de dados não muda.
**O que a tela promete:** exatamente isso, e nada além. O aviso na tela diz que
o Vívio Fit não recebe o dinheiro nem sabe quando o pagamento cai.

### 21. A tabela de faixas funcionais não passou por revisão profissional
**Assumida em:** leitor de exames (2026-08-02)
**Estado:** `packages/contracts/src/exames.ts` traz 20 marcadores, cada um com
faixa laboratorial, faixa funcional e as duas fontes. As faixas laboratoriais
saem de diretriz de sociedade médica onde existe diretriz; as funcionais, de
diretriz quando a própria diretriz define alvo (vitamina D, LDL, TFG) e de
consenso de prática funcional no resto.
**O risco:** é a melhor leitura das fontes citadas, **não um parecer**. Cinco
marcadores têm até a faixa LABORATORIAL vindo de fonte que não é diretriz —
`INSULINA_JEJUM`, `HOMA_IR`, `FERRITINA`, `VITAMINA_B12` e `PCR_US` — e é a
faixa laboratorial que carimba "Crítico". Há teste congelando essa lista de
cinco, para crescê-la ser decisão consciente e não descuido.
**Pagar em:** antes de o primeiro paciente real ver a tela. Um médico e um
nutricionista precisam percorrer a tabela marcador por marcador. O aviso de
que são referências de otimização, e não critério de diagnóstico, já está na
tela de resultado e na Metodologia — mas aviso não substitui revisão.
**O que ajuda na revisão:** a página `/metodologia` lista as 20 faixas com as
fontes, geradas da própria tabela. Dá para imprimir e revisar sem ler código.
**Vale também para as 8 regras de alerta** (`packages/banco/regras/regras.ts`):
elas decidem quando um achado vira orientação para outro profissional, e o
texto que o personal recebe é conduta — "evite creatina e dieta hiperproteica"
é uma recomendação clínica, ainda que derivada. Revisar junto com as faixas.

### 23. Sobra um filete de mídia órfã, e não vale um deletador automático
**Assumida em:** upload do laudo (2026-08-04)
**O que era o problema de verdade, e foi corrigido:** a auditoria das rotas
que mexem em arquivo achou **dois vazamentos reais**, os dois já pagos —
`exercicios.vincularVideo` trocava o vídeo sem apagar o anterior (até 100 MB
cada, e regravar a demonstração algumas vezes enchia o disco), e o
`anexarLaudo` não conferia se a chave era de quem estava anexando, o que
além de vazar arquivo deixava apontar o exame para o laudo de outra pessoa.
Fotos, materiais e a troca de laudo já limpavam corretamente.
**O que sobra:** o arquivo que subiu para o storage e cujo vínculo com o banco
falhou logo depois — rede caindo entre o upload e a chamada que grava a chave.
É a única fonte que resta, e ela é estreita.
**Por que NÃO existe uma varredura que apaga:** um processo que apaga arquivo
"sem dono no banco" é perigoso na proporção inversa do problema que resolve.
Um bug nele apaga foto de evolução de paciente, que é irreversível, para
recuperar alguns megabytes. O risco não paga.
**Se um dia valer a pena**, o desenho seguro é: `listar(prefixo)` na interface
`Armazenamento`, um comando que só **relata** os órfãos, e só depois — com o
relatório limpo por algumas semanas — um modo que apaga, restrito a arquivos
com mais de N dias. Nunca começar pelo que apaga.
**Reavaliar quando:** existir rota de exclusão de exame, ou o volume passar de
uns 60% sem explicação.

### 25. Seis `useEffect` com dependência faltando
**Assumida em:** 2026-09-01, pelo ESLint recém-instalado
**Estado:** seis efeitos omitem `recarregar` (ou equivalente) da lista de
dependências. Hoje funcionam: as listas foram mantidas à mão e estão corretas.
**O risco:** é latente, não ativo. Quem editar `recarregar` para usar uma
variável nova e esquecer de acrescentá-la ao efeito ganha um closure velho —
tela que não atualiza, sem erro nenhum.
**Por que não foi corrigido junto:** a correção certa é `useCallback`, e
nenhum dos seis arquivos tem teste que prove que o comportamento não mudou.
Mexer às cegas em código que funciona troca um risco latente por um ativo.
**Onde:** `apps/mobile/app/(tabs)/nutricao.tsx`, `apps/mobile/app/fotos.tsx`,
`apps/web/app/(pro)/exercicios/page.tsx`, `apps/web/components/MenuLateral.tsx`,
`apps/web/components/MetasDoAluno.tsx` (dois).
**Pagar em:** junto com o teste de render de cada uma dessas telas (pendência 14b).

## Resolvidas

### Auditoria geral de 22/09/2026 — cinco achados, todos pagos no mesmo dia

**1. Falha crítica no Next (execução remota de código).** A produção rodava
15.5.22; duas falhas críticas — uma no otimizador de imagens, outra em
servidores Windows — foram corrigidas na 15.5.24. E o otimizador estava
**acessível no domínio** (`/_next/image` respondia 200), que é justamente o
caminho da falha. Subiu para 15.5.25 e, como nenhuma tela usa `next/image`, o
otimizador foi desligado (`images.unoptimized`): porta que não existe não
precisa de correção na próxima vez.

**2. O site não mandava nenhum cabeçalho de segurança.** Entraram em
`next.config.mjs`: HSTS de um ano com subdomínios (sem `preload`, que é decisão
do dono do domínio), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy` (câmera só para o próprio site, o resto fechado) e uma CSP
parcial — `frame-ancestors`, `base-uri`, `form-action`, `object-src`. A CSP
completa fica para quando houver nonce nos scripts do Next: mal ajustada, ela
quebra a aplicação inteira em produção sem aparecer em teste nenhum.

**3. Credencial velha parada no banco.** `SessaoRefresh` guardava **3.006**
hashes de sessão da autenticação antiga, e `User.senhaHash` ainda tinha o hash
argon2 das sete contas. Nada disso é usado desde que o Supabase Auth assumiu.
As três tabelas mortas foram apagadas e a coluna, esvaziada (ela continua
existindo, fora do alcance de todo papel).

**4. O `schema.prisma` divergia do banco.** Os preenchimentos automáticos de
`id` — postos à mão quando as gravações morriam em violação de nulo — existiam
só no banco. A próxima migração os teria removido, trazendo o defeito de volta.
Agora estão declarados, e `migrate diff` acusa "empty migration".

**5. Vinte e três chaves estrangeiras sem índice.** Com sete contas não se
nota; com mil, cada remoção de pai varre a tabela filha. Declaradas no schema e
criadas na mesma migração (`20260922163000_limpeza_da_autenticacao_antiga`).

**Também conferido e em ordem:** 71 tabelas com RLS e 150 políticas, 99 funções
`security definer` todas com `search_path` fixado, o disparo de lembretes com
10.180 execuções sem falha, a trilha de auditoria gravando, nenhuma chave de
mídia apontando para arquivo ausente, nenhum `.env` versionado e nenhuma conta
de teste sobrando.

**O que ficou de fora, e por quê:** um PDF de teste órfão no compartimento
`exames` (a remoção foi barrada pela proteção do ambiente; some pelo painel do
Supabase em dois cliques) e os 40 alertas de dependência do Expo, que são
ferramenta de desenvolvimento e não vão para o ar — valem junto da próxima
subida de versão do aplicativo.

### "Quem viu meus dados" parou de ser escrito em 11/09 — resolvida em 2026-09-15
**O que estava errado:** a trilha de auditoria era gravada pela API — um
interceptor anotava cada acesso bem-sucedido às rotas de dado de aluno, e os
guards anotavam as recusas. Quando o SDK passou a ler e escrever direto no
banco, nada tomou o lugar. A última linha de `LogAuditoria` era de 11/09; a
tela do titular (direito dele pela LGPD) continuava abrindo, com um passado que
tinha parado.

**O que foi feito:** `43-trilha-de-auditoria.sql`, em duas metades com
garantias diferentes — e a diferença fica escrita:
- **Escrita por gatilho** nas 15 tabelas de dado de aluno (medida, exame,
  prescrição, plano de treino…). Criar, alterar, apagar ou carimbar remoção
  grava a linha na mesma transação, com IP e navegador tirados dos cabeçalhos
  da requisição. Não depende do app. Não anota o titular mexendo no que é dele
  nem escrita sem sessão.
- **Leitura por função**, `registrar_leitura`, que o SDK chama nas 28 leituras
  de dado de aluno sem esperar a resposta. O ator é a sessão, nunca parâmetro;
  o banco decide LER ou NEGADO pelas mesmas regras das políticas. A mesma
  leitura repetida em dez minutos conta uma vez — sem isso, os painéis que
  consultam a cada poucos segundos soterrariam a lista.

**O limite, dito com todas as letras:** leitura não tem gatilho no Postgres.
Quem montar consulta à mão pelo console do navegador lê o que a política deixa
e não é anotado. A trilha de leitura é o registro do uso do app, não barreira.

**Como se prova:** `packages/banco/teste/trilha-de-auditoria.spec.ts` (as duas
metades pela porta do banco, com o par do que anota e do que não anota) e
`packages/sdk/teste/trilha-de-leitura.spec.ts` (a tela do profissional lê, a
linha aparece, o aluno a vê na tela dele).

### O disparo de lembretes morreu com a API, e voltou dentro do banco — resolvida em 2026-09-15
**O que estava errado:** a varredura que cria os lembretes rodava dentro da API,
com `@nestjs/schedule`. Quando `apps/api` saiu do repositório, nada tomou o
lugar: a tela de lembretes continuava salvando horário e nenhum aviso nascia —
tudo parecia funcionar. Era também a pendência 11 (o agendador dentro do
processo da API).

**O que foi feito:** `42-disparo-de-lembretes.sql` — a função
`disparar_lembretes_devidos(p_agora)` e o `pg_cron` chamando a cada minuto
(`cron.job` `vivio-disparar-lembretes`, conferido rodando com `succeeded`). O
app não consegue chamá-la: quem pudesse escolheria `p_agora` e fabricaria aviso
de qualquer dia.

**Um defeito da versão da API que não veio junto:** o "já treinou hoje"
comparava o dia local do aluno com as bordas do dia em UTC. O treino das 22h de
ontem em São Paulo (01h de hoje em UTC) calava o lembrete de hoje. Agora as
bordas são as do dia local.

**Como se prova:** `packages/banco/teste/lembretes.spec.ts`, 16 casos — os da
suíte antiga da API mais o do dia local, o do fuso inválido, o de o app não
poder disparar e o que compara os textos do banco com `PREVIA_LEMBRETE`, que
precisam morar nos dois lados. O horário de prova é sempre o de daqui a seis
horas, para o agendador de verdade nunca criar um aviso no meio do teste.

### Abrir a mesma conversa ao mesmo tempo não cria duas — resolvida em 2026-09-15
Era a pendência 24. `abrir_conversa` procurava e depois criava, sem fila: dois
aparelhos, um toque duplo ou um retry de rede criavam duas conversas da mesma
dupla. Não há chave natural para índice único (o par mora em
`ParticipanteConversa`), então a função pega uma trava por dupla que dura a
transação (`pg_advisory_xact_lock`). A segunda abertura espera e encontra a
conversa pronta; duplas diferentes não esperam umas pelas outras.

**Como se prova:** `packages/banco/teste/conversa-sem-duplicata.spec.ts`. O
teste de seis aberturas simultâneas **passava também sem a trava** — a corrida
não se reproduz sob comando —, então o que prova é outro: o teste segura a
trava da dupla por fora e confere que a abertura fica esperando. Ele falhou
antes da correção e passa depois.

### Pendências da época da API que deixaram de existir — encerradas em 2026-09-15
Registradas quando havia um servidor NestJS; com `apps/api` fora do
repositório, o problema que descreviam não tem mais onde acontecer:
- **4b. Limite de tentativas por processo** — o login é do Supabase Auth, que
  aplica o próprio limite por IP e por conta.
- **16. Falha de envio de e-mail engolida** — verificação e redefinição de
  senha são e-mails do Supabase Auth.
- **17. `COOKIE_SAMESITE`** — não há mais cookie de sessão nosso; a sessão é a
  do `supabase-js`.
- **18. Imagens Docker nunca construídas** — a imagem da API foi apagada; a web
  é publicada pelo build da Cloudflare, que roda a cada push e está verde.
- **26. `treino.e2e.spec.ts` intermitente** — o arquivo era da suíte HTTP da
  API e saiu com ela, sem causa apurada; o comportamento de treino tem prova
  própria em `packages/sdk/teste/treinos.spec.ts`.

### O aplicativo não estava instalável, e nada avisava — resolvida em 2026-09-12
**O que era:** o Worker da Cloudflare redireciona `/sem-conexao.html` para
`/sem-conexao` (307), e `cache.addAll` **rejeita** resposta redirecionada. O
trabalhador de fundo falhava ao instalar, e falhava em silêncio: sem erro na
tela, sem nada no console de quem usa. O Android simplesmente não oferecia
"instalar", e a página de sem conexão nunca existia.

**Como apareceu:** conferindo o site no ar, por `curl`, um caminho de cada vez.
Nenhum teste pegaria — o redirecionamento é do host, não do código.

**O que foi feito:** o caminho perdeu o `.html`, e a instalação deixou de ser
tudo-ou-nada (`addAll` derruba o trabalhador inteiro se um arquivo falhar, e
nada ali é essencial a esse ponto). `apps/web/teste/trabalhador-de-fundo.test.ts`
roda o `sw.js` de verdade contra um `fetch` que imita o Worker.

**Conferido no ar depois do deploy:** trabalhador registrado e ativo, cache
`vivio-v2-casca` com a página de sem conexão dentro.

### As funções do banco estavam abertas a quem não entrou no app — resolvida em 2026-09-12
**O que era:** toda função no Postgres nasce com `EXECUTE` para **PUBLIC**, e
`anon` herda de PUBLIC. O arquivo 11 revogava de `anon` com todas as letras — e
isso não tirava nada. As linhas estavam lá, dizendo que a porta estava fechada.

**Quanto valia:** 32 funções ao alcance do `anon`, e **nenhuma sem guarda** — as
que tocam dado começam perguntando `usuario_atual()`, nulo sem sessão. Não havia
vazamento. O que havia era o padrão errado: a próxima função escrita sem a
pergunta nasceria alcançável por quem não entrou no app.

**O que foi feito:** a varredura entrou no arquivo 99, que roda sempre por
último. Função nova nasce fechada ao `anon`; as duas exceções são a página
pública do profissional e o formulário de contato dela. A auditoria ganhou a
seção e ela **reprova** — `rls:auditar` sai com erro se alguém criar uma função
e não rodar o aplicador.


### O SDK deixou de falar com a API — resolvida em 2026-09-12
**O que era:** o SDK fazia 63 chamadas HTTP à API NestJS, espalhadas por 22
grupos. A API guardava, em TypeScript, as regras que decidem quem lê e quem
escreve cada coisa — e essas regras não existiam no banco. Enquanto a API fosse
o único caminho, funcionava; com o cliente falando direto com o Postgres, cada
regra que só morava lá deixaria de existir.

**O que ficou:** UMA chamada, `exercicios.importarDieta`, que depende de um
modelo de IA e espera uma Edge Function. Todo o resto fala com o banco.

**O que foi para o banco, por família:**

| arquivo | o que passou a valer lá |
| --- | --- |
| `32-armazenamento.sql` | seis compartimentos, cada um com teto e formatos |
| `33-exercicio.sql` | escopo pelo papel, procedência congelada, vídeo do dono |
| `34-foto-evolucao.sql` | a terceira trava: `visivelPara`, foto a foto |
| `35-exame-laudo.sql` | o laudo é do médico e do aluno, e a chave não circula |
| `36-conteudo-do-profissional.sql` | um gatilho para cinco tabelas; competência profissional |
| `37-corpo-e-gasto.sql` | autorrelato, laudo de laboratório e medição, cada um com seu dono |
| `38-prescricao-e-anamnese.sql` | registro clínico atômico, com nome congelado |
| `39-painel-do-profissional.sql` | agregações com o recorte de consentimento dentro |
| `40-verificacao-de-profissional.sql` | a fila do admin, com alcance amplo em porta estreita |

**O que a migração ACHOU pelo caminho** — cada um é um defeito que existia e não
aparecia:

1. **A foto de evolução perdeu a terceira trava** (entrada própria abaixo). O
   pior dos achados: qualquer profissional com consentimento de EVOLUCAO lia a
   linha de toda foto do aluno, e com a chave em mãos, o arquivo.
2. **Ninguém conseguia apagar o próprio laudo.** `exames_le` não tinha a
   condição de dono que os outros compartimentos têm, e o Storage SELECIONA
   antes de apagar: a exclusão respondia 200 com lista vazia e o arquivo ficava.
   Cada troca de laudo deixava até 25 MB de dado clínico órfão, sem nada no log.
3. **A competência profissional só existia no cliente.** A tabela que diz que
   medicamento é privativo do médico vivia em `@vivio/contracts`, onde um
   `insert` pelo console do navegador passa por cima.
4. **`arquivoUrl` do exame vinha nulo desde a migração dos exames**, e a tela
   dizia ao médico da equipe que o laudo é "acessível apenas ao médico da
   equipe".
5. **O tipo do arquivo não chegava ao Storage.** O `supabase-js` manda Blob como
   multipart e lê o tipo do próprio Blob; foto vinda de `fetch().blob()` no
   celular não tem tipo, e era recusada como "formato não aceito" sendo um JPEG
   aceito. Quebrava todo envio de foto pelo aplicativo.
6. **Colunas que o Prisma preenchia e o banco não.** `@default(cuid())` e
   `@updatedAt` são do CLIENTE Prisma: pelo PostgREST não há quem os preencha, e
   o INSERT morre em violação de nulo na primeira gravação de verdade. A
   auditoria ganhou uma seção para essa família inteira.
7. **Um gatilho meu redirecionava em silêncio.** Forçar `alunoId` no INSERT de
   cardio fazia o profissional que tentasse lançar no nome do aluno gravar no
   nome DELE — a política aprovava, porque o valor já tinha sido reescrito.
8. **O 42501 engolia a frase dos nossos gatilhos.** "Chave de arquivo não
   pertence a você." virava "Você não tem acesso a este conteúdo.", e a pessoa
   via a recusa sobre um botão a que tem acesso.

**Como se prova:** `packages/sdk/teste/` tem 34 arquivos e 276 casos rodando
contra o banco de verdade, e `pnpm --filter @vivio/banco rls:auditar` compara o
que o SDK usa com o que o banco deixa — e sai com erro quando divergem.

**A última chamada também saiu**, para uma função de borda:
`supabase/functions/ler-dieta`. O cliente HTTP da API foi apagado do SDK
(`requisicao()`, `baseUrl`, o armazenamento de tokens próprio), junto com o
endereço da API na web, no aplicativo e nos 32 arquivos de teste.

**E apagá-lo revelou um defeito que ele escondia.** O aviso de sessão perdida —
que na web manda para o login — só disparava de dentro desse cliente HTTP.
Quando o último grupo saiu da API, o caminho ficou sem ninguém que o
percorresse, e o aviso parou de disparar em silêncio: sessão revogada, tela
mostrando a pessoa logada, cada consulta voltando vazia. Religado ao evento
`SIGNED_OUT` do Supabase, com prova em `packages/sdk/teste/sessao.spec.ts`.
Janela a saber: o Supabase só dá a sessão por morta quando o token de acesso
vence E o refresh é recusado, então a pessoa revogada vai ao login em até 15
minutos — a mesma janela do token da API antiga.

**O que falta (ação sua):**

1. **Implantar a função e pôr o segredo** (`supabase/README.md` tem os três
   comandos). A chave da Anthropic é sua e vai direto da sua máquina para o
   projeto; enquanto ela não existe, a tela diz "a leitura automática não está
   configurada" e o resto do app segue inteiro.
2. **Conferir se sobrou mídia no volume do Railway** antes de desligar o
   serviço — desligá-lo leva o volume junto.

### `apps/api` saiu do repositório — resolvida em 2026-09-15

O servidor NestJS, os 34 testes e2e por HTTP, o Dockerfile, o envio de e-mail e
os scripts de senha argon2 (`criar-admin`, `redefinir-senha`, `preparar-teste`,
que escreviam `senhaHash` para um login que não existe mais) foram apagados,
junto com `DEPLOY.md` e os passo a passo do Railway e do e-mail.

O que ainda serve mudou de casa para **`packages/banco` (`@vivio/banco`)**:
schema e migrações do Prisma, as regras (`prisma/rls/`) com aplicador, conferidor
e auditor, os importadores (`ferramentas/`: wger, Prime, catálogo), as regras de
alerta que geram o dossiê clínico (`regras/`), a semente e os 8 testes que
provam as regras direto no Postgres. O `importar-wger` deixou de gravar pelo
driver de mídia da API e grava direto no compartimento `catalogo`, com a chave
de serviço, como o `subir-catalogo`. A semente não gera mais hash de senha: quem
autentica é o Supabase Auth, via `semear-auth`.

Os segredos locais (`.env`, `.env.supabase`) e a mídia baixada vieram junto,
continuam fora do Git, e a suíte do SDK agora os lê de `packages/banco/`.

**E a mudança achou um defeito meu, de segurança.** A varredura de funções do
`99-fechar-portas.sql`, escrita dias antes para tirar do anônimo o `EXECUTE` que
toda função ganha por `PUBLIC`, dava `grant ... to authenticated` em TODA
função. Parecia repor o que o `PUBLIC` dava; na prática **reabriu ao app nove
funções que outros arquivos tinham fechado de propósito** — o hook do token,
`vinculo_de`, `consentimento_de` (um profissional voltava a poder perguntar se
um colega tem consentimento de um aluno) e seis auxiliares das funções de
gravação. O teste da cadeia do cliente pegou ao rodar da casa nova. Agora a
varredura pergunta antes de revogar se o `authenticated` alcançava a função, e
só devolve a quem alcançava; o auditor ganhou a seção **FUNÇÃO INTERNA AO
ALCANCE DO APP**, que acusou as nove antes da correção e zero depois.

**Como se prova:** `pnpm --filter @vivio/banco rls:auditar` → "Nada a
corrigir"; banco 139/139, SDK 278/278, web 306/306, contracts 344/344, `tsc`
limpo em banco, sdk, web, mobile e contracts, lint sem erro.


### A foto de evolução voltou a ter as três travas — resolvida em 2026-09-11
**O que estava errado:** a foto de evolução sempre teve TRÊS travas — vínculo,
consentimento de EVOLUCAO e a lista `visivelPara`, que o aluno define **foto a
foto**. As duas primeiras estavam no banco. A terceira estava em JavaScript,
dentro de `fotos.service.ts`, que trazia todas as fotos do aluno e filtrava
depois de receber.

Enquanto a API era o único caminho, funcionava. Com a consulta passando a ser do
cliente, o filtro em JavaScript deixa de existir: qualquer profissional com
consentimento de EVOLUCAO lia a linha de **toda** foto do aluno, inclusive as
que ele nunca compartilhou. E a linha carrega `chaveArquivo` — a política do
compartimento também parava em vínculo e consentimento, então a chave em mãos
abria o arquivo.

**Por que passou:** a regra nunca esteve escrita em SQL. A tradução das
políticas partiu do que o banco já sabia responder (vínculo, consentimento) e do
que as políticas existentes diziam; a trava que morava só no serviço não
aparecia em lugar nenhum para ser traduzida. Achada ao migrar o grupo `fotos`,
lendo o serviço linha a linha antes de reescrevê-lo.

**O que foi feito:** `34-foto-evolucao.sql`. A pergunta virou uma função,
`posso_ver_a_foto(alunoId, visivelPara)`, usada nos dois lugares — a política da
tabela e a do compartimento. A do compartimento agora exige a LINHA da foto:
existir, não estar removida, e ter o papel de quem pede na lista. O titular
continua alcançando o arquivo direto, sem depender de linha, porque o arquivo
sobe antes de a linha existir.

**Como se prova:** `packages/sdk/teste/fotos.spec.ts`, com vínculo e
consentimento abertos para DOIS profissionais de propósito — só a terceira trava
decide. A prova vai até o arquivo, e mede a revogação com **sessão nova**: o
Storage guarda a decisão por par (sessão, arquivo) por cerca de 15 minutos, e
com a sessão reaproveitada todo caso de revogação passaria verde sem revogar
nada.


### A suíte deixava alunos de mentira no banco de produção — resolvida em 2026-09-10

`test/resumo.e2e.spec.ts` criava três alunos por execução e, no `afterAll`,
apagava o vínculo e o consentimento deles — mas nunca a conta. Desde que a
suíte passou a rodar contra o Supabase de produção, em 2026-09-01, 27 execuções
tinham deixado **81 contas** `resumo.*@teste.com` na base real. Era o único
arquivo que criava conta sem apagar; agora usa o mesmo `apagarConta` dos outros.

A mesma varredura achou mais quatro sobras de execuções interrompidas — duas
`estranho.*` de 06/08, uma `prova-*` de 01/09 e uma `semverif.*` de uma
execução derrubada nesta data. As 85 foram removidas conta por conta, cada uma
numa transação: as chaves estrangeiras com RESTRICT recusariam qualquer conta
com histórico de verdade, e nenhuma recusou. Ficaram só as da semente (Ana,
Bruno, Carla).

A sobra `semverif` expôs outro defeito, este no teste de vínculo. "Um
profissional ativo por tipo" pegava *qualquer* outro PERSONAL com `findFirst`;
como a semente tem um só, o teste caía no `return` e **passava sem nunca ter
rodado a regra** contra o Supabase. Achou o profissional sem verificação, parou
na trava do conselho e quebrou. Agora o próprio arquivo cria o segundo personal,
já verificado, e confere o código da recusa e o estado que ficou. (A mensagem
não serve de prova ali: o Prisma troca o texto de todo `23505` cru por "Unique
constraint failed". O PostgREST, que é o que o app usa, entrega o texto
inteiro.)

### A tabela de migrações estava aberta à chave anônima — resolvida em 2026-09-10

`_prisma_migrations` era a única tabela da schema sem RLS: foi o Prisma que a
criou, e por isso nenhum arquivo de `prisma/rls/` a cobria. Sem RLS, o
`grant all` que o Supabase dá de nascença valia inteiro — e a chave anônima,
que viaja no pacote do site e dentro do app, **lia, alterava, apagava e
truncava** a tabela. Conferido antes de mexer: a leitura anônima devolveu os
nomes das migrações e o UPDATE anônimo foi aceito.

Nenhum dado de aluno ficava exposto por ali, mas apagar o histórico faria o
Prisma achar o banco vazio, e o `migrate deploy` seguinte tentaria recriar tudo
por cima de uma base cheia.

A mesma revisão achou mais três coisas, todas em `99-fechar-portas.sql` ou ao
lado da regra que faltava:

- **`notificacao_escreve`**, política que nenhum arquivo criava, com
  `with check (true)`. Não fazia efeito porque `Notificacao` nunca teve
  permissão de INSERT — mas bastava uma permissão bem-intencionada para a caixa
  de avisos de qualquer um aceitar texto de qualquer outro. Removida.
- **`Medida` sem política de UPDATE.** O SDK grava com `upsert`, e o lado do
  conflito é um UPDATE: corrigir o peso do dia devolvia "Você não tem acesso a
  este conteúdo" sobre a medida que a pessoa acabara de gravar. Política e
  gatilho novos em `07-politicas-escrita.sql`, e teste que falha sem eles.
- **82 permissões de escrita sem política** e `TRUNCATE`/`REFERENCES`/`TRIGGER`
  para `anon` em 68 tabelas, herança do `grant all`. Falhavam fechadas, mas
  armavam a próxima: uma política de leitura acrescentada numa dessas tabelas
  traria de brinde o INSERT e o DELETE parados ali. A varredura as tira pela
  regra, e roda por último (`99-`) para pegar também os grupos que ainda vão
  ser migrados.

`pnpm --filter @vivio/banco rls:auditar` refaz a conferência contra o banco e sai
com código 1 se algo voltar: tabela sem RLS, permissão sem regra, política
órfã, ou leitura/escrita do SDK que o banco não deixa.

### A suíte parou de poder apagar gente de verdade — resolvida em 2026-09-01

Era a pendência 2, e ela estava **pior do que descrita**. O texto dizia "o mesmo
Neon usado para desenvolver"; na verdade era o mesmo Neon usado em **produção**.
`apps/api/.env` apontava para `ep-jolly-glade-ayydu988-pooler` e a produção para
`ep-jolly-glade-ayydu988` — o mesmo banco, por duas portas.

A rede de segurança não pegou porque procurava a palavra `prod` na URL, e nenhum
provedor gerenciado põe isso no hostname. A regra procurava o **nome** do perigo.

**A solução mudou de ideia uma vez, e vale registrar por quê.** A primeira
versão usou o Neon — liberado pela migração para o Supabase — como banco de
teste separado. Funcionava, mas manter dois provedores só para isso foi contra a
decisão de ficar em Cloudflare e Supabase, e a escolha passou a ser rodar contra
o banco único.

O que protege agora **olha o conteúdo**, não o nome nem a variável: antes de
qualquer arquivo de teste, `test/guarda-de-producao.ts` pergunta ao banco se há
usuário fora da semente (`@viviofit.com.br`, `@exemplo.com`, `@teste.com`). Se
houver, recusa a suíte inteira.

Enquanto o app tem só semente dentro, apagar não custa nada. No dia em que o
primeiro aluno se cadastrar, o portão fecha sozinho — sem depender de alguém
lembrar de trocar uma variável no dia certo.

A régua tem teste próprio (`guarda-de-producao.spec.ts`), e não por capricho:
provar o guard criando um usuário falso no banco seria escrever em produção para
verificar a proteção de produção.

### O laudo do exame passou a ter arquivo — resolvida em 2026-08-04
**Era:** pendência 22. O modelo já tinha `chaveArquivo` e `podeVerArquivo()` já
decidia quem recebe link, mas faltava a ponta do upload — que dependia de
storage sobrevivendo ao deploy, ou seja, da pendência 19. As duas se pagaram
juntas, na ordem certa.
**Correção:** `LAUDO_EXAME` como tipo de mídia próprio, com teto de 25 MB e
lista fechada de formatos (PDF ou foto). O arquivo sobe **direto para o
armazenamento** pelo fluxo que já existia — autorizar, enviar, vincular a
chave — e nunca passa pela API.
**A permissão mais estreita do app, e é de propósito:** anexar e ler são a
mesma permissão — médico e o próprio aluno. Deixar o nutricionista anexar seria
pedir que ele suba um arquivo que não consegue reabrir. Ele continua lendo os
marcadores e vendo que **existe** laudo, o que é honesto: dá para pedir a
leitura ao médico.
**Uma decisão de custo:** o link assinado só é emitido no exame individual,
nunca na listagem. Cada link custa uma assinatura e vale poucos minutos; gerar
sessenta de uma vez para uma lista que ninguém vai abrir é desperdício, e um
link de vida curta numa lista provavelmente expiraria antes do clique.
**Trocar o laudo apaga o anterior**, e a remoção vem depois do update: se ela
falhar, o exame já aponta para o arquivo novo.
**Verificado:** 7 testes e2e novos (21 no arquivo de exames) — incluindo que
nutricionista e personal levam 403 ao anexar, que o aluno recebe o link do
próprio laudo e que a listagem não emite link. E no navegador: o médico anexou
um PDF, o link assinado devolveu **200 com o arquivo íntegro**, e o mesmo exame
aberto pelo nutricionista mostrou o aviso sem link e sem botão.
**Abriu a pendência 23:** não há faxina de mídia órfã.

### A bioimpedância parou de contrariar a própria legenda — resolvida em 2026-08-01
**Era:** a terceira e última tela da leva da pendência 14b, e a mais fácil de
errar por digitação: é uma transcrição: oito números copiados do visor da
balança, nenhum conferível contra outra fonte, e faixa no schema para todos.
Tinha o mesmo `Number(...) || 0` das outras duas e um `completo` que só olhava
`peso > 0 && gordura > 0` — as outras seis faixas não eram conferidas em lugar
nenhum. Pior, o `opcional()` devolvia esse mesmo `|| 0`: campo opcional com texto
ilegível virava `0` e era recusado pelo `.min()` do schema como se alguém tivesse
errado de propósito.
**O defeito que só apareceu lendo a tela inteira:** a legenda embaixo do painel
dizia "se a balança informar a massa magra, ela prevalece sobre a derivada". O
servidor cumpre isso (`calcularPorBioimpedancia` usa `massaMagraKg ?? peso -
massaGorda`). **A prévia mostrava sempre a derivada** — com 70 kg, 25% e massa
magra informada de 51,2 kg, a tela dizia 52,5 kg e o número mudava depois de
salvar. Agora a prévia usa a informada e a legenda muda de texto para dizer que
foi ela que valeu.
**Correção:** `apps/web/lib/bioimpedancia.ts`, no mesmo formato das outras duas.
A tabela `CAMPOS` que desenha o formulário passou a carregar a faixa de cada
campo, espelhando `avaliacaoBioimpedanciaSchema` — assim campo novo sem faixa não
passa despercebido, porque é a mesma lista.
**De quebra, a terceira repetição virou extração:** `numeroDoCampo`,
`problemaDeFaixa`, `erroVisivel` e `arredondar` foram para `apps/web/lib/campos.ts`.
Os módulos de tela reexportam o que já expunham, e **os testes de `dieta` e
`adipometria` não mudaram uma linha** — continuarem verdes é a prova de que a
extração não alterou comportamento. Junto veio uma mensagem melhor: campo vazio
diz "preencha este campo", campo ilegível diz "use só números"; antes os dois
diziam "preencha", o que é confuso para quem acabou de digitar ali.
**Um caso em que a tela é mais rígida que o schema, de propósito:** texto
ilegível num campo opcional vira ausência no corpo, e o schema aceita — o campo
simplesmente não vai. Mas alguém digitou ali, e enviar sem ele seria descartar em
silêncio o que a pessoa escreveu. A tela para e pede correção. Há teste nomeando
esse caso, para ninguém "consertar" a divergência depois achando que é bug.
**Verificado:** 20 testes de unidade e 6 de render. Suíte da web: **146 testes**.
No navegador: 70 kg + 25% deram 17,5 e 52,5 kg; informar 51,2 trocou a massa magra
e o texto da legenda; massa óssea 50 kg pintou "entre 0.5 e 10 kg" no campo e
travou o botão. Nada foi salvo.
**Ainda aberto:** pendência 14b — sobraram as telas que guardam `Number()` direto
no estado, listadas lá em cima.

### A equação de composição corporal virou um lugar só — resolvida em 2026-08-01
**Era:** a adipometria, candidata seguinte da pendência 14b. E o que o teste
encontrou primeiro não foi um bug de campo: era **a equação clínica escrita duas
vezes**. `apps/api/.../antropometria.ts` tinha Jackson & Pollock e Siri; a página
`avaliacao/adipometria/page.tsx` tinha uma cópia manual dos mesmos coeficientes,
para mostrar o percentual enquanto o profissional digita sem ida e volta à API.
Dois conjuntos de coeficientes clínicos para manter iguais — e o `index.ts` do
`packages/contracts` diz, em letra de fôrma, "se um tipo é usado pelo backend E
por um cliente, ele mora aqui. Nada de duplicar definição em apps/*". É a mesma
história da regra de consentimento, que já tinha divergido uma vez.
**Correção:** `siri`, `densidadeCorporal`, `ErroDeCalculo` e os limites de
plausibilidade passaram para `packages/contracts/src/avaliacao.ts`, ao lado de
`DOBRAS_DO_PROTOCOLO` e `faixaDeGordura`, que já moravam lá. O `antropometria.ts`
importa e reexporta — fica com o que só o servidor faz: exigir o protocolo
completo, recusar o implausível e montar o resultado gravado. **Os 15 testes da
API não foram tocados e continuam passando**, que é a prova de que a mudança não
mexeu em nenhum número.
**O bug que a duplicação escondia, e que era o pior de todos:** a prévia da tela
somava as dobras com `Number(texto) || 0` e calculava com o que houvesse. Com
duas de três dobras preenchidas, a soma sai menor, a densidade sai maior e a tela
mostra um percentual **baixo** — plausível e errado. No caso testado no navegador:
9,1% com duas dobras contra 13,6% com as três. O servidor **sempre** recusou meio
protocolo (`calcularPorDobras` lança se faltar dobra, e o comentário lá explica
exatamente por quê); a tela é que mostrava assim mesmo. Agora ela recusa também,
e diz "Preencha as 3 dobras e a idade para ver o resultado".
**Outros três defeitos, achados ao escrever o teste:** a idade entra na equação e
não era conferida em lugar nenhum (`completo` não a olhava — 150 anos ia direto
para o 400); o peso só era conferido como `> 0`, contra um schema que exige 20–400
kg; e a altura fazia `Number(altura)` **sem** trocar a vírgula, ao contrário do
peso logo acima — "175,5" virava `NaN` e era enviado como `null`.
**Decisão de interface:** o erro só pinta o campo depois que alguém digitou algo
(`erroVisivel`). A tela abre com peso e dobras vazios; recebê-la toda vermelha
seria ranzinza sem informar nada. Quem cobra o que falta é a lista acima do botão.
**Verificado:** 26 testes de unidade em `lib/adipometria.spec.ts` — inclusive que
meio protocolo devolve `null`, que a prévia confere com a equação publicada
(coeficientes literais no teste, como no da API) e que massa gorda + magra fecham
com o peso — e 7 de render em `teste/adipometria.test.tsx`. Suíte da web: **120
testes**. Operado no navegador: duas dobras deixaram o resultado em "—" com o
botão travado, a terceira trouxe 13,6% / faixa Bom / 45 mm / 10,9 + 69,1 = 80 kg,
e 150 mm numa dobra pintou "entre 1 e 100 mm" no campo. Nada foi salvo.
**Ainda aberto:** pendência 14b — a bioimpedância é a próxima, com o mesmo `|| 0`
já localizado.

### O editor de plano alimentar ganhou teste — e ele achou um bug — resolvida em 2026-08-01
**Era:** a candidata seguinte da pendência 14b. O campo de gramas é texto (tem de
ser: fosse `type="number"` controlado, apagar para redigitar viraria zero a cada
tecla) e virava número dentro da própria tela, com `Number(texto.replace(',','.'))`
**sem nenhuma rede**. Campo vazio virava `0`; campo com lixo virava `NaN`, que o
`JSON.stringify` transforma em `null`. Os dois eram enviados, e o schema
(`quantidadeG: z.number().positive().max(5000)`) recusava com 400 — que a tela
traduzia como "Não foi possível salvar o plano", sem dizer qual alimento estava
errado, depois de a dieta inteira estar montada. E `podeSalvar` só olhava o nome
do plano e se cada refeição tinha item: **nenhuma quantidade era conferida**.
**Correção:** a conversão, a validação e a montagem do corpo saíram para
`apps/web/lib/dieta.ts`, como já tinha sido feito com a anamnese. `quantidadeEmGramas`
devolve `null` — e não `0` — quando não dá para ler, que é a distinção que faltava
entre "o campo está vazio" e "prescreveram zero grama". `problemasDoPlano` espelha
cada regra do schema e devolve texto pronto; a tela pinta o erro no campo (o
`Campo` já tinha a prop `erro`, ninguém usava aqui) e lista o que falta acima dos
botões, porque botão desabilitado sem explicação é o pior dos dois mundos.
**Três defeitos que ninguém tinha registrado, achados ao escrever o teste:**
o nome da refeição podia ser apagado (o schema exige `min(1)`); as metas aceitavam
decimal e valor fora de faixa (o schema exige `.int()` e mínimo 500 para kcal);
e `Number(kcalAlvo) || null` tratava a meta `0` como ausente.
**O bug do próprio teste, que virou correção de configuração:** o teste da vírgula
decimal afirmou 120 g em vez de 152,5. Não era a tela — era `mock.calls[0]` lendo o
envio do **teste anterior**, porque o histórico de um `vi.fn()` sobrevive entre
testes. Entrou `clearMocks: true` no `vitest.config.ts`, irmão do `afterEach(cleanup)`
que já existia para o DOM: os dois resolvem a mesma classe de vazamento.
**Verificado:** 23 testes de unidade em `lib/dieta.spec.ts` (cada montagem termina
em `criarPlanoDietaSchema.safeParse`, a mesma validação da API) e 9 de render em
`teste/montar-dieta.test.tsx` — inclusive que apagar as gramas trava o envio e que
o corpo que sai do `sdk` passa no schema. Suíte da web: **87 testes**. E operado no
navegador com a conta do seed: campo apagado mostrou "informe a quantidade em
gramas" sob o campo e travou os dois botões, `152,5` virou 195 kcal na aba, e meta
kcal 100 foi apontada como fora da faixa. Nada foi salvo — a ficha da Ana não foi
tocada.
**Nota de localização:** o teste de render mora em `teste/` e não ao lado da
página porque o caminho dela tem `(pro)` e `[alunoId]`; parêntese e colchete são
sintaxe de glob, e um `.test.tsx` ali dentro corre o risco de nunca ser coletado.
**Ainda aberto:** pendência 14b — a adipometria é a próxima.

### Arrastar para reordenar — resolvida em 2026-08-01
**Era:** pendência 6. Reordenar era só com os botões ↑ ↓.
**Correção:** `useArrasteParaReordenar` + `PunhoDeArraste` (HTML5 puro, sem
biblioteca), na montagem de treino e no editor de anamnese. **Adição, não
troca:** os botões ↑ ↓ continuam onde estavam, porque arrastar não existe no
teclado nem no leitor de tela e pagar polimento com acessibilidade seria um mau
negócio. Só o punho é arrastável — o cartão inteiro impediria selecionar o texto
dos campos de série e repetição que moram dentro dele. E o punho é
`aria-hidden`: para quem não usa mouse ele não faz nada, e anunciá-lo daria uma
parada de tabulação que não leva a lugar nenhum.
**De quebra, uma dívida de acessibilidade que ninguém tinha registrado:**
reordenar mudava a lista sem mudar o foco. Para quem enxerga, o item
visivelmente subia; para quem ouve, nada acontecia. Agora existe uma região
`aria-live="polite"` (`components/Anuncio.tsx`) que diz "Supino movido para a
posição 2 de 5" — nas duas telas, tanto pelo botão quanto pelo arrasto.
**Regra única:** `reordenar(itens, de, para)` serve às duas formas. Arrastar não
é troca de pares — levar o 5º ao 1º tem de manter a ordem relativa dos outros —
e os botões são só o caso `para = i ± 1`. Duas implementações divergiriam.
**Bug que só apareceu no navegador:** a origem do arrasto vivia em `useState`.
Nos testes, `fireEvent` reconcilia entre uma chamada e outra, então o
`dragover` já enxergava o valor. No navegador os eventos podem cair no mesmo
tique, o estado ainda não chegou, e o gesto virava nada. Passou para `useRef`
(síncrono), e entrou um teste que dispara os três eventos dentro de um único
`act` — sem ele, a suíte continuaria verde com o bug de volta.
**Verificado:** 9 testes de `reordenar` sem DOM, 10 de render cobrindo a fiação,
e as duas telas operadas no navegador (ordem mudando e a região viva com o texto
certo).

### A regra "mesma versão de React nos dois apps" virou teste — resolvida em 2026-08-01
**Era:** pendência 8. A regra existia como parágrafo nesta página, que ninguém lê
ao rodar `pnpm add react@latest` num app só. Faixas diferentes entre web e
mobile, com `nodeLinker: hoisted`, instalam duas cópias de React e o build da
web morre com `Cannot read properties of null (reading 'useContext')` — erro que
não diz nada sobre a causa.
**Correção:** `apps/web/teste/versoes-do-react.spec.ts` lê os dois
`package.json` e falha se `react` ou `react-dom` divergirem, **ou** se a versão
tiver `^`/`~` — a faixa é justamente o que deixa cada app resolver para um patch
diferente sem ninguém editar nada.
**Nota:** a pendência 7 (nodeLinker hoisted) continua aberta; este teste cobre a
consequência mais cara dela, não a causa.

### A regra de consentimento virou um lugar só — resolvida em 2026-08-01
**Era:** dívida que não estava registrada. "Este profissional pode ver este
escopo?" estava escrito em dois lugares — o `ConsentGuard` e o relatório de
carteira — e **já tinha divergido uma vez**: o relatório filtrava só por
`profissionalId` e ignorava o consentimento com `profissionalId: null`, que é o
concedido para toda a equipe de cuidado e o caso mais comum. Efeito: aluno que
autorizou tudo aparecia na tela como se não tivesse autorizado nada.
**Correção:** `consentimentoVigentePara(profissionalId)` em
`src/common/consentimento/regra.ts`, usada pelos dois. Divergir de novo passa a
exigir reescrever de propósito.
**Verificado:** 3 testes de unidade da regra, mais os e2e de consentimento e de
relatórios que já cobriam o comportamento das duas pontas.

### A suíte passou a escolher o banco — e a recusar o errado — resolvida em 2026-08-01
**Era:** parte da pendência 2. Os e2e liam `DATABASE_URL` direto, sem nada entre
eles e o banco apontado. Uma variável errada no ambiente e a suíte — que faz
`deleteMany` — rodava onde não devia.
**Correção:** `apps/api/test/banco-de-teste.ts` como `setupFiles`, antes de
qualquer import (o PrismaClient lê `DATABASE_URL` ao ser construído; depois já é
tarde). Usa `DATABASE_URL_TEST` quando existe, avisa em voz alta quando não
existe, e **recusa rodar** se a URL parecer de produção ou `NODE_ENV` for
`production`.
**Verificado:** os três caminhos — aviso no banco de dev, recusa com uma URL
contendo "prod", e uma URL de teste inválida chegando de fato ao Prisma
(`Can't reach database server at localhost:59999`), que é a prova de que a
troca funciona.
**Ainda aberto:** pendência 2 — falta criar o branch no Neon, que é ação na
conta e está com o passo a passo lá.

### A web ganhou teste de render — e ele achou um bug — resolvida em 2026-07-31
**Era:** `apps/web` tinha vitest, mas o único arquivo testado era `lib/menu.ts`.
Nenhum componente era renderizado; toda verificação de tela vinha de operar o
navegador na mão. O risco anotado era literalmente "o editor de posologia
enviar string vazia onde o schema espera ausência".
**Correção:** jsdom + testing-library + `user-event`, com
`apps/web/vitest.config.ts` (o `jsx: preserve` que o Next exige não serve para o
esbuild do Vitest — daí `esbuild.jsx: 'automatic'`, que vale só no teste) e um
`cleanup` global, sem o qual o DOM de um teste vaza para o seguinte. 13 testes
no `EditorDeItensPrescritos`, cada um terminando com `posologiaSchema.safeParse`
— a mesma validação que a API aplica, para tela e servidor não divergirem.
**O bug que apareceu no primeiro `vitest run`:** o campo de horários usava
`value={item.horarios.join(', ')}` e devolvia o array já normalizado a cada
tecla. Digitar a vírgula produzia `['08:00']`, que voltava para a tela como
"08:00" — **a vírgula sumia no instante em que era digitada**. Era impossível
escrever o segundo horário, e "08:00, 20:00" chegava ao servidor como um único
horário `"08:0020:00"`, recusado pelo schema. Corrigido com um
`CampoDeHorarios` que guarda o texto digitado em estado próprio e só reescreve
o campo quando o valor vem de fora (carregar um modelo). Declarado **fora** do
componente de cima: dentro, o React o trataria como um tipo novo a cada tecla e
tiraria o cursor do campo.
**Verificado também o que não estava quebrado:** dose decimal digitada dígito a
dígito ("2.5") chega como `2.5`; e a única outra tela com o mesmo padrão
(`opcoes.join('
')` na anamnese) já filtrava as vazias antes de enviar.
**De quebra:** a validação e a montagem do corpo do modelo de anamnese saíram do
componente para `lib/anamnese.ts`, com 13 testes que confrontam "o que a tela
deixa salvar" com "o que o schema do servidor aceita" — divergir aí é erro que
só aparece no envio.
**Total na web:** 33 testes.
**Ainda aberto:** pendência 14b — as outras telas.

### Login ganhou limite de tentativas — resolvida em 2026-07-31
**Era:** `/auth/login` aceitava tentativas ilimitadas. A defesa era só o custo
do argon2id — que encarece cada tentativa, mas não impede um script de ficar
tentando a noite inteira.
**Correção:** `@Limite()` na rota + `LimiteInterceptor` global (inerte onde não
há o decorador, para nenhuma rota passar a ser limitada sem alguém ter dito que
sim). No login: 10 senhas erradas na mesma conta ou 60 no mesmo IP em 15 minutos
respondem **429 LIMITE_EXCEDIDO** com `Retry-After`. Só **falha** conta — quem
acerta a senha nunca é penalizado, e acertar zera o histórico da conta (o balde
do IP não, senão bastaria um login válido próprio para limpar a contagem entre
as tentativas). O reenvio de verificação conta **toda** requisição, porque
responde 204 mesmo quando não faz nada e por isso nunca produz "falha" — sem
isso seria um jeito grátis de encher a caixa de entrada de alguém.
**Detalhes que decidiram o desenho:** a janela é fixa e não é renovada a cada
falha, senão quem erra sem parar ficaria preso para sempre — e quem faz isso
costuma ser a pessoa dona da conta. Corpo inválido (400) e erro nosso (5xx) não
contam: um bug de front trancaria o usuário. E o `Map` tem teto, senão IP
rotativo viraria vazamento de memória.
**Pegadinha do deploy:** atrás do proxy do Railway `req.ip` é o IP do proxy — o
mesmo para todo mundo — e o limite por IP trancaria o login **geral**. Daí
`PROXY_HOPS` (=1 no Railway), com aviso no boot se faltar em produção.
**Verificado:** 8 testes de unidade do `Limitador` (relógio injetado, sem subir
a aplicação) e 3 e2e — a 11ª senha errada devolvendo 429, outra conta entrando
normalmente enquanto a primeira está bloqueada, e o acerto zerando a contagem.
**Ainda aberto:** pendência 4b — falta ser distribuído.

### Testes pararam de apagar as medidas da Ana — resolvida em 2026-07-31
**Era:** o `afterAll` do e2e de consentimento fazia `deleteMany` de **todas** as
medidas da Ana e do Bruno. Rodar a suíte esvaziava o histórico de composição
corporal, e os gráficos do app ficavam em branco até alguém digitar tudo de
novo à mão.
**Correção:** o teste passou a usar uma data reservada (`DATA_DO_TESTE`,
propositalmente distante de qualquer dado real) e a apagar **só** a medida que
ele mesmo cria, naquela data.
**O que a conferência revelou:** as medidas da Ana já estavam em zero — o seed
nunca criou nenhuma, então o histórico só existia enquanto alguém não rodasse a
suíte. Por isso o seed passou a semear cinco medições da Ana, com datas
relativas a hoje (data fixa envelhece e vira "última medição há 8 meses" na
tela). Agora `pnpm seed` recompõe o histórico, e nenhum teste o apaga.
**Auditoria dos outros 21 arquivos de teste:** todos os `deleteMany` restantes
miram usuários que o próprio teste criou (sufixo único) ou registros que ele
inseriu. Nenhum outro encosta em conta do seed.
**Verificado:** suíte inteira (313 testes) e, logo depois, consulta ao banco
mostrando as 5 medidas da Ana intactas.

### Verificação de profissional ganhou painel — resolvida em 2026-07-30
**Era:** `verificadoEm` era **lido** (`vinculos.service.ts` barra quem não foi
verificado) mas nada no app o **escrevia** — só o seed. A primeira conta criada
em produção nascia travada, sem convidar aluno nenhum e sem saída pela
interface. O contorno era rodar `prisma/ativar-profissional.ts` no servidor a
cada cadastro novo.
**Correção:** `/admin/profissionais` com fila por status (aguardando, verificados,
recusados), busca, e link direto para a consulta pública do CONFEF/CFN/CFM. A
aprovação pede confirmação dizendo o que está em jogo — "esta pessoa passa a
acessar dados de saúde de alunos" — e grava **quem** aprovou, agora com foreign
key de verdade (`verificadoPor`), fechando também a metade do schema que estava
aberta. A recusa exige motivo de ao menos 5 caracteres e o guarda: o
profissional precisa saber o que corrigir. Aprovar depois de recusar limpa a
recusa; recusar depois de aprovar revoga a verificação.
**Verificado:** 12 testes e2e — inclusive que o personal não abre o painel, que
o profissional não se autoverifica, e o que realmente importa: **antes da
aprovação o convite a aluno é recusado, depois passa**. E operado no navegador
pelos três estados.
**Detalhe que o teste pegou:** eu esperava 403 no convite de profissional não
verificado; o código responde 409 CONFLITO — que é mais correto, porque o papel
está certo e o que falta é a verificação. O teste foi corrigido para afirmar o
comportamento real.
**Script mantido:** `ativar-profissional.ts` continua no repositório como saída
de emergência, caso não exista nenhum admin acessível.

### Refresh token saiu do localStorage — resolvida em 2026-07-30
**Era:** `apps/web` guardava access e refresh em `localStorage`. Um XSS lia o
refresh de 30 dias e mantinha a sessão indefinidamente.
**Correção:** o refresh passou a viajar em cookie `httpOnly`, `SameSite=Lax`,
`Path=/api/v1/auth`, e é **removido do corpo** da resposta — deixá-lo ali
tornaria o cookie inútil. O access token de 15 minutos vive só na memória do
`VivioClient`; ao recarregar a página o SDK troca o cookie por um par novo
sozinho. Quem pede esse modo é o cliente, pelo cabeçalho `X-Vivio-Cliente: web`;
sem ele a API responde como antes, que é o que o mobile precisa (SecureStore =
Keychain/Keystore, fora do alcance do JavaScript, e sem cookie jar).
**Efeito no ataque:** um XSS na web pega no máximo 15 minutos de access token,
em vez de 30 dias renováveis.
**Detalhe que só o teste pegou:** o `cookieParser` estava no `main.ts`, por onde
os testes não passam — teste e produção rodavam configurações diferentes.
Passou para `AppModule.configure`.
**Verificado:** 27 testes em `auth.e2e.spec.ts` (cookie httpOnly com os
atributos certos, rotação só com cookie, recusa sem cookie e sem corpo, cookie
apagado quando a rotação falha, logout revogando pelo cookie, e o mobile
continuando a receber no corpo) e, no navegador, login → `localStorage` vazio e
`document.cookie` vazio → reload mantendo a sessão → logout derrubando de vez.
**Ainda aberto:** pendência 17 — a escolha de hospedagem decide se `Lax` basta.

### Verificação de e-mail não bloqueava o login — resolvida em 2026-07-30
**Era:** a conta nascia com `emailVerifEm = null` e nada era bloqueado. Pior: o
próprio cadastro já devolvia o par de tokens, então quem usasse o e-mail de
outra pessoa entrava na hora e nunca precisava do link.
**Correção:** `TokenVerificacaoEmail` guarda só o hash (mesmo tratamento do
refresh), vale 24h e serve uma vez só; pedir outro invalida o anterior, com 60s
de intervalo mínimo entre envios. O cadastro passou a responder
`RespostaRegistro` **sem tokens** e o login recusa com `EMAIL_NAO_VERIFICADO`
(403, depois de conferir a senha — antes disso vazaria quais e-mails existem).
Confirmar o link já abre a sessão, porque abrir o link prova a posse do e-mail.
O driver de envio segue o padrão do push: `CorreioDeLog` sem `SMTP_URL`,
`CorreioSmtp` com ela.
**Migração:** contas anteriores foram marcadas como verificadas — trancá-las
retroativamente não protegeria ninguém e derrubaria todo mundo.
**Verificado:** 21 testes em `auth.e2e.spec.ts` (bloqueio, link inventado, link
usado duas vezes, expirado, reenvio invalidando o anterior, reenvio que não
revela se o e-mail existe) e o fluxo inteiro operado no navegador.
**Ainda aberto:** pendências 15 e 16 — falta a credencial de SMTP e a
retentativa de envio.

### Testes e2e mutavam os dados do seed — resolvida em C6
**Era:** os e2e usavam as contas do seed. O teste de execução ativava um plano
próprio (arquivando o da Ana) e, pior, qualquer treino feito no app virava "a
última execução" e quebrava as asserções da coluna ANTERIOR — suíte instável.
**Correção:** `execucao.e2e.spec.ts` cria o próprio aluno (registro + vínculo +
consentimento) no `beforeAll` e apaga tudo dele no `afterAll`.
**Verificado:** duas rodadas seguidas, 77 testes passando nas duas.
**Ainda aberto:** os demais e2e continuam usando o seed (ver pendência 2).
