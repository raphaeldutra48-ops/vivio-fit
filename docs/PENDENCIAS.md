# Pendências

Dívidas conscientes assumidas durante a construção. Cada uma tem o passo em que
deve ser paga. Não apagar item sem resolver — mover para "Resolvidas".

## Abertas

### 2. Teste roda contra o banco de desenvolvimento
**Assumida em:** B2
**Estado:** os e2e criam e apagam usuários no mesmo Neon usado para desenvolver.
Usam sufixo único por execução, então não colidem entre si.
**O que já está feito:** `apps/api/test/banco-de-teste.ts` roda antes de tudo e
(a) usa `DATABASE_URL_TEST` quando existe, (b) avisa em voz alta quando não
existe, e (c) **recusa rodar** se a URL parecer de produção ou `NODE_ENV` for
`production` — a suíte faz `deleteMany`, e apontá-la para o banco errado uma
vez basta para o estrago.
**O que falta (ação sua, precisa da conta Neon):** no painel do Neon, `Branches`
→ `New branch`, nome `test`, a partir de `main`. Copiar a connection string e
pôr em `apps/api/.env`:

```
DATABASE_URL_TEST=<string do branch test, com -pooler>
DIRECT_URL_TEST=<a mesma, sem -pooler>
```

Depois, uma vez: `cd apps/api && npx prisma migrate deploy` e `pnpm seed` com
`DATABASE_URL` apontando para o branch novo. A partir daí `pnpm test` usa o
branch sozinho, e o aviso some.
**Pagar em:** antes do CI.

### 4b. O limite de tentativas é por processo, não distribuído
**Assumida em:** dívidas técnicas (o que sobrou da pendência 4)
**Estado:** os contadores de `@Limite()` vivem na memória do processo. Com N
instâncias da API, o atacante ganha N vezes o orçamento de tentativas, e um
deploy zera tudo.
**Por que basta por ora:** a API roda em uma instância, e o caso real —
alguém martelando uma conta de um lugar só — está coberto. O argon2id continua
tornando cada tentativa cara.
**Pagar em:** junto do Redis (pendência 11). Só a implementação de `Limitador`
muda; o decorador e o interceptador ficam como estão.

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

### 10. Push nao entrega de verdade (driver de log)
**Assumida em:** C8
**Estado:** todo o agendamento funciona — horario no fuso do aluno, dias da
semana, deduplicacao, "nao lembrar quem ja treinou". A entrega usa o driver de
log: escreve no console em vez de mandar para o aparelho.
**Por que:** enviar exige projeto no Firebase e credencial.
**Pagar em:** quando o Firebase existir. Trocar o provider de ENVIADOR por uma
implementacao com o SDK do FCM; nenhuma regra de agendamento muda.

### 11. Scheduler roda dentro do processo da API
**Assumida em:** C8
**Estado:** a varredura de lembretes usa @nestjs/schedule, a cada minuto, no
mesmo processo da API.
**Consequencia:** com varias instancias, todas varrem. E seguro (a unique
(userId, tipo, referenteA) impede envio duplicado, e ha teste para isso), mas
desperdica consulta ao banco.
**Pagar em:** quando houver Redis — mover para BullMQ com job unico.

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

**O que sobra desta pendência é cobertura, não defeito.** Três telas têm só
teste de unidade da regra, sem teste de render da fiação:
`plano-alimentar/receitas`, `plano-alimentar/refeicoes` e `treino/novo`. Foram
operadas no navegador, mas nada impede alguém de desligar a fiação sem quebrar
teste. As outras três têm os dois.

**Uma instância remanescente, benigna:** `financeiro/page.tsx:226` faz
`setRepetir(Math.max(1, Number(e.target.value)))`. O `Math.max` impede zero e
`NaN` de chegarem ao servidor, então não há bug de dado — o custo é de uso:
apagar o campo faz ele saltar para `1` sozinho. Vale arrumar junto da próxima
mexida no financeiro, não isolado.

O padrão inteiro está em [ADAPTACOES.md](ADAPTACOES.md).

### 15. E-mail de produção depende de uma SMTP_URL que ainda não existe
**Assumida em:** verificação de e-mail
**Estado:** o driver SMTP está escrito e é escolhido sozinho quando `SMTP_URL`
está definida. Sem ela, o `CorreioDeLog` imprime a mensagem no log — que é o
comportamento certo em dev e **inaceitável em produção**: ninguém receberia o
link e ninguém conseguiria entrar.
**Pagar em:** no deploy. Contratar o provedor (Resend, SES, Postmark…), colar a
URL em `SMTP_URL` e `EMAIL_REMETENTE` nas variáveis do Railway, e conferir que
`WEB_PUBLIC_URL` aponta para o domínio real — é ela que monta o link.
**Como verificar:** cadastrar uma conta e receber o e-mail de fato.

### 16. Falha de SMTP é engolida
**Assumida em:** verificação de e-mail
**Estado:** `CorreioSmtp.enviar` captura o erro e apenas registra no log. Um
cadastro com provedor fora do ar responde 201 como se tudo tivesse dado certo, e
a pessoa fica esperando um e-mail que não vem.
**Por que aceitei:** a alternativa imediata era derrubar o cadastro já gravado
no banco por causa de uma falha externa, o que é pior. O reenvio na tela de
entrada é a saída manual.
**Pagar em:** quando existir fila (Redis, pendência 11) — enfileirar o envio com
retentativa em vez de tentar uma vez dentro da requisição.

### 17. `COOKIE_SAMESITE` precisa virar `none` se web e API não forem do mesmo site
**Assumida em:** cookie httpOnly
**Estado:** o cookie sai com `SameSite=Lax`, que só acompanha requisições
same-site. Porta não conta para "site", então `localhost:3000` → `localhost:3333`
funciona, e em produção funciona se forem subdomínios do mesmo domínio
(`app.viviofit.com.br` e `api.viviofit.com.br`).
**Risco:** hospedar a web na Vercel e a API no Railway são sites diferentes — o
cookie simplesmente não é enviado e ninguém mantém sessão. A env
`COOKIE_SAMESITE=none` cobre o caso, **mas** `None` desliga a proteção CSRF que
o `Lax` dava de graça: aí `/auth/refresh` e `/auth/logout` passam a precisar de
token anti-CSRF.
**Pagar em:** na decisão de hospedagem. Preferir domínios irmãos e continuar com
`Lax` é mais simples e mais seguro do que implementar anti-CSRF.

### 18. Imagens Docker nunca foram construídas
**Assumida em:** preparação do deploy
**Estado:** `apps/api/Dockerfile` e `apps/web/Dockerfile` estão escritos, mas
esta máquina não tem Docker — nenhum `docker build` rodou.
**O que foi verificado sem ele:** os comandos que as imagens executam
(`turbo run build --filter=@vivio/api` e `--filter=@vivio/web`), a geração do
bundle standalone do Next e sua execução real em `apps/web/server.js`, a recusa
da API a subir sem `ORIGENS_PERMITIDAS`, e o CORS respondendo só à origem
conhecida.
**O que continua sem prova:** o `pnpm install --frozen-lockfile` dentro do
contêiner, o `prisma generate` com o engine linkado contra a OpenSSL da imagem
slim, e os caminhos dos `COPY`.
**Pagar em:** no primeiro deploy — o log do Railway aponta a linha exata se algo
estiver errado.

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
**Vale também para as 8 regras de alerta** (`apps/api/src/modules/alertas/regras.ts`):
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

## Resolvidas

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
