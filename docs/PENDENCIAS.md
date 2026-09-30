# Pendências

Dívidas conscientes assumidas durante a construção. Cada uma tem o passo em que
deve ser paga. Não apagar item sem resolver — mover para "Resolvidas".

## Abertas

> **Para o primeiro teste com pessoas de verdade, o roteiro está em
> [`TESTE-REAL.md`](TESTE-REAL.md)** — o que precisa estar pronto antes, em que
> ordem testar, o que olhar em cada tela e o que fazer quando algo falhar. Ele
> também registra a decisão que não pode ser tomada no susto: **no instante em
> que a primeira pessoa real criar conta, as suítes param de poder rodar contra
> este banco** (a guarda de produção recusa, e é para isso que ela existe).


### 28. O Railway continua conectado ao repositório (só o dono da conta desliga)
**Assumida em:** 2026-09-30 · **Depende de:** você, no painel do Railway.
**Estado:** o código não tem mais nada de Railway — isso foi removido em 24/09 e
confirmado. O que sobrou é a integração **GitHub ↔ Railway**, que vive na conta do
Railway e não no repositório: cada push dispara DOIS deploys (`artistic-grace` e
`spectacular-wisdom`, ambos "production"), e ao menos um falha. Todos os commits
de 30/09 têm o par registrado.
**Por que importa:** são minutos de build — possivelmente cobrados — para publicar
um serviço que não existe mais, e cada push deixa um status vermelho no histórico
do repositório, que atrapalha quem for ler o que falhou de verdade.
**Como desligar:** no painel do Railway, projeto
`cd9fa41f-b8b1-4fe8-8043-6fe65f28846e`, em cada um dos dois serviços:
**Settings → Source → Disconnect**. Se nada mais viver ali, apagar o projeto
inteiro resolve de uma vez. Os deploys param no push seguinte.
**Por que não faço:** é a sua conta, e a operação é destrutiva do lado deles.

### 27. Os documentos legais são rascunho, e não há botão de excluir conta
**Assumida em:** 2026-09-25, na auditoria geral
**Estado:** `/termos` e `/privacidade` existem, são públicas, descrevem o sistema
como ele é (as seis autorizações, a transferência internacional na leitura
automática, o pagamento que não passa pela plataforma) e estão ligadas ao login,
ao cadastro e à tela de autorizações do aplicativo. O que falta não é código:
- **[PREENCHER] no texto:** razão social e CNPJ do controlador, e-mail do
  encarregado, prazos de guarda, idade mínima, foro. Enquanto houver, a página
  mostra aviso de rascunho — e há teste que exige esse par.
- **Revisão jurídica.** O texto foi escrito a partir do comportamento real do
  software, que é a parte que um advogado não adivinha; o inverso também vale.
- **Exclusão de conta não tem tela.** O direito existe na LGPD e a política diz
  que o pedido é atendido por e-mail. Um botão exige decidir o que apagar e o que
  o profissional precisa guardar por obrigação dele — e isso é decisão de
  produto, não de implementação.
**Pagar em:** antes de abrir cadastro para fora. É bloqueador de lançamento, não
de desenvolvimento.

### 7. nodeLinker hoisted no workspace inteiro
**Assumida em:** C4
**Estado:** `pnpm-workspace.yaml` usa `nodeLinker: hoisted` por causa do Metro.
**Consequência:** o monorepo perde o isolamento estrito do pnpm — um pacote passa
a conseguir importar dependência que não declarou, e o erro só aparece no build
de produção.
**Mitigação atual — 30/09:** a consequência virou TESTE.
`apps/web/teste/dependencias-declaradas.spec.ts` lê os imports dos 7 pacotes e
exige que cada um esteja no `package.json` daquele pacote, nomeando o arquivo
quando falha. Os 7 estão limpos hoje, e o guarda foi confirmado por mutação (um
import de `date-fns` em `packages/contracts` deixa a prova vermelha).
Antes disso o preço era real: em 29/09 custou duas rodadas vermelhas de CI — um
teste do aplicativo importava `@vivio/ui` (pacote da web) e passava localmente, e
`@testing-library/user-event` sumiu quando a árvore foi remontada. Nos dois casos
a mensagem não dizia nada sobre a causa.
`apps/web/teste/versoes-do-react.spec.ts` continua cobrindo a consequência mais
cara (duas cópias de React), que era a pendência 8, e o `pnpm build` dos 7
workspaces segue como rede final.
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

### 12. As suítes rodam contra o banco de produção, e demoram
**Assumida em:** Fase 2 · **Atualizada em:** 2026-09-24 (o texto antigo falava do
Neon, que saiu de cena)
**Estado:** as 1.111 provas rodam contra o **Supabase do projeto** — não há
banco de teste separado. A suíte inteira leva de 4 a 8 minutos, e a maior parte
disso é rede: cada caso fala com o banco de verdade.
**Por que é seguro hoje, e quando deixa de ser:** o banco tem só a semente e o
que os testes criam, e um guarda (`teste/guarda-de-producao.ts`) recusa a suíte
inteira se achar uma conta de gente real dentro. No dia em que o primeiro aluno
se cadastrar, esse portão fecha sozinho — e aí é obrigatório um banco separado,
não uma escolha.
**O que fazer quando fechar:** um projeto Supabase só para teste, com as
migrações e `prisma/rls/` aplicados por `aplicar-rls.ts`, e `DATABASE_URL_TEST`
apontando para ele. O caminho já existe no arranjo das suítes.

### 14b. RESOLVIDA — as 24 telas do aplicativo têm prova
**Assumida em:** dívidas técnicas · **Atualizada em:** 2026-09-29
**Estado:** encerrada em 29/09. O aplicativo tinha ZERO prova e passou a ter
**196**, cobrindo todas as 24 telas mais a barreira de erro: cadastro, login,
autorizações, tela inicial, aba de treino, aba de evolução, agenda, execução do
treino, fila offline, rascunho do treino, nutrição do dia, fotos, check-in,
medidas, composição, recordes, metas, lembretes, conversas, prescrições,
materiais, cardio, calorimetria e meus dados. A web segue com 322.
**O que a varredura final encontrou** (24 telas, uma por uma):
- **Prescrições** dizia "Nenhuma prescrição — quando seu nutricionista ou médico
  prescrever algo, aparece aqui" quando a busca falhava, por um
  `catch(() => undefined)`. Era o pior desta família no app inteiro: a frase
  afirma que NÃO EXISTE receita, e a decisão tomada em cima dela é parar de tomar
  o medicamento. Mesmo padrão corrigido em materiais, cardio e calorimetria.
- **Cardio**: o botão de salvar ficava DESABILITADO com "42,5" no campo
  (`!Number(duracao)` → NaN), pedindo os minutos que já estavam escritos. Nada a
  corrigir na tela, só um botão morto.
- **Calorimetria**: "1.850", como o laudo imprime, era lido como 1,85 — número
  válido, valor absurdo, e um metabolismo de 1,85 kcal/dia contaminaria o
  planejamento alimentar. Agora a faixa do laudo (800–4500) é conferida na tela.
- **Meus dados**: "1,75" na altura virava `NaN` → `null` no JSON → e `null` ali
  significa LIMPAR. Quem mexia na altura saía sem nenhuma, e a taxa metabólica
  passava a ser calculada sem ela.
- **Login**: profissional era recusado na mensagem mas a sessão FICAVA gravada;
  na abertura seguinte ele entrava nas abas como aluno de si mesmo.
- **Agenda**: "Não vou" cancelava consulta sem perguntar, encostado no botão de
  confirmar — a única ação irreversível do app sem confirmação.
- **Check-in**: o aviso "o peso não foi salvo" era escrito e a tela fechava no
  mesmo instante, então ninguém o lia.
- **Metas**: tipo de meta desconhecido escrevia "alvo 75 undefined" na tela.
- **Varredura final dos `catch` mudos:** sobravam dois que afirmavam coisas
  falsas. A tela inicial dizia "Nenhum treino registrado ainda" quando a busca do
  histórico falhava, e a nutrição concluía "0 de 4 refeições registradas hoje"
  quando não conseguia saber o que já havia sido registrado — cobrando a pessoa
  pelo que ela fez. Os outros `catch(() => undefined)` do app foram conferidos um
  a um e são deliberados: reenvio de verificação (a API não diz se a conta
  existe), logout, sondagem do chat, e as buscas cujo padrão já é o seguro.
- **Barreira de erro**: não existia. Um campo ausente numa resposta derrubava a
  árvore e deixava a tela BRANCA, sem texto nem saída — aconteceu duas vezes
  durante a escrita das provas. Agora há tela de falha com "tentar de novo", e as
  faixas de validação (`FAIXA_ALTURA_CM`, `FAIXA_TMB_MEDIDA`,
  `FAIXA_DURACAO_CARDIO`) saíram dos schemas para constantes exportadas, para a
  tela recusar antes de mandar com a frase que diz o que fazer.
**O que as telas de EXIBIÇÃO encontraram** (elas não escrevem nada, e mesmo
assim): a tela inicial sugeria a mesma sessão para sempre depois do quinto
treino — a conta era `sessoes[execucoes.length % n]` e a lista de execuções vem
limitada a cinco, então `5 % 2` congelava em 1 e o plano A/B virava só B. O chat
mostrava "Nenhuma conversa ainda" a quem estava sem sinal, no canal por onde vem
resposta de médico. E a composição corporal era a única tela do app escrevendo
ponto decimal ("77.5 kg") em vez de vírgula. Com essa última, toda tela
do aplicativo que DECIDE algo tem prova; o que segue sem ela é exibição do que o
SDK devolveu, coberta pelo typecheck e pelas 291 provas do SDK.
**Como escolher a próxima:** onde a tela DECIDE algo — o que ela manda, o que ela
impede, o que ela diz quando recusam. Tela que só exibe o que o SDK devolveu não
precisa: o typecheck e as provas do SDK já cobrem.
**O que a execução do treino encontrou:** o defeito mais caro achado até aqui.
A conversão dos números digitados era `Number(texto || 0)` crua, e o teclado
decimal brasileiro oferece VÍRGULA: uma carga de "22,5" virava `NaN`, que o
`JSON.stringify` grava como `null` e o schema recusa. O treino inteiro falhava ao
salvar, no fim de uma hora de academia, dizendo só "não foi possível salvar o
treino no aparelho". Todas as outras telas do aplicativo já trocavam a vírgula
por conta própria — esta, a mais usada de todas, era a única que não trocava,
porque a regra morava em `apps/web/lib/campos.ts` e o aplicativo não podia
importar de lá. Agora ela é `numeroDoCampo` em `@vivio/contracts`, com prova
própria, e a web a reexporta.
**E o mesmo buraco estava em mais quatro telas do aplicativo:** medidas, cardio,
calorimetria e check-in trocavam a vírgula por conta própria, mas nenhuma
tratava o ILEGÍVEL — "84,,5" (acontece ao corrigir sem apagar) virava `NaN`, ia
como `null` e o servidor recusava o formulário inteiro com uma frase genérica
sobre sete campos. As quatro passaram a usar a mesma regra; a de medidas agora
aponta o campo pelo nome e não manda nada pela metade, com cinco provas.
**O que as fotos encontraram:** dois defeitos, ambos silenciosos. O envio
recusado por FORMATO devolve do SDK a frase exata ("Formato de arquivo não
aceito: image/gif."), e a tela trocava por "Não foi possível enviar a foto. Tente
de novo." — que faz a pessoa reenviar o mesmo arquivo para sempre; e falta de
sinal dizia a mesma coisa, mandando procurar defeito numa foto que está boa. Pior:
liberar dois profissionais em sequência APAGAVA a primeira liberação, porque cada
toque manda a lista inteira de quem vê montada a partir do que a tela tinha na
mão, e ela ainda não havia recarregado. Agora é um pedido por vez.
**O que as três anteriores encontraram:** cada leva pagou o próprio custo. A
nutrição do dia estava contando refeição DESMARCADA como registrada (guardava a
chave vazia em vez de esquecê-la), de modo que quem tocasse por engano e
desfizesse saía da cobrança sem nunca ter respondido. Antes dela, o dublê de
sessão devolvendo objeto novo a cada render pôs a tela em laço — 53 recargas num
teste — e a prova de horário dependia da hora em que a suíte rodasse; o relógio
do teste agora é fixo.
**O que a suíte do aplicativo NÃO cobre, por desenho:** gesto, layout nativo,
permissão de câmera e módulo nativo. Para isso não há substituto a um aparelho —
e é o que o primeiro build de teste vai servir para conferir.

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

## Resolvidas

### Auditoria de 30/09: o que ela encontrou no que foi feito hoje
Varredura do próprio trabalho do dia, com as suítes rodadas por CÓDIGO DE SAÍDA (e
não pelo resumo na tela), diagnóstico ao vivo, auditoria de RLS e o CI de cada um
dos 13 commits.
**Três defeitos nas minhas próprias correções:**
1. **O guarda de dependências nascia incompleto.** A lista de pacotes era escrita à
   mão, e `packages/config` ficou de fora — nunca foi conferido. Lista fixa num
   guarda desses é pior que guarda nenhum, porque dá a impressão de cobrir o
   repositório. Agora os pacotes são descobertos em `apps/*` e `packages/*`, e um
   caso novo falha se a descoberta quebrar (senão a suíte passaria sem testar nada).
2. **O teste que derruba o selo do personal podia deixar o banco sujo.** O
   `finally` devolve a verificação, mas `finally` não roda se o processo morrer —
   e este é o banco de PRODUÇÃO: o personal semeado ficaria não verificado e as
   outras suítes quebrariam na rodada seguinte por um motivo alheio. Agora o selo
   é guardado no `beforeAll` e devolvido também no `afterAll`.
3. **Duas sobras da família "vazio que mente".** A tela de anamnese do aluno dizia
   "Você ainda não tem modelos. Montar o primeiro" quando a busca falhava — quem
   lê isso monta de novo um questionário que já existe e passa a ter dois para
   escolher. E marcar um pedido de contato como atendido falhava em silêncio: o
   pedido voltava não atendido e o profissional clicava de novo até desistir.
**O que eu havia julgado aceitável foi CORRIGIDO no mesmo dia**, a pedido — e
revendo com o objetivo de começar teste real, nenhuma das quatro era aceitável:
- **Carteira de alunos:** sem o relatório, NENHUM aluno aparecia marcado como
  precisando de atenção, e todos ficavam com o selo "Ativo". Quem parou de treinar
  ou de fazer check-in é exatamente quem desaparecia nesse silêncio. A lista segue
  útil; o que mudou é a tela dizer que não conferiu.
- **Cardápios:** duas falhas caladas. O seletor "Aplicar em" escrevia "Nenhum aluno
  ativo" para quem tem trinta, e o `.catch(() => [])` POR ALUNO fazia o plano que
  serviria de molde desaparecer da lista — o profissional procura um plano que sabe
  que existe, não acha, e conclui que precisa montar de novo. Agora a lista de
  alunos vem do gancho compartilhado e as falhas por aluno são CONTADAS, com a
  tela declarando a lista incompleta.
- **Prescrições do aluno:** o atalho "partir de um modelo" desaparecia na falha, e
  sem ele a posologia é redigitada à mão — é redigitando que se troca "1
  comprimido" por "1 mL".
- **Catálogo de alimentos:** o filtro por grupo ficava vazio na tabela de onde sai o
  cálculo de todo cardápio, e quem procura "leguminosas" concluía que a categoria
  não existe.
**Prova:** 7 casos em `apps/web/teste/nada-mais-mente.test.tsx`, os quatro
principais confirmados por mutação.
**O que NÃO está errado, apesar de parecer:** a chave `eyJ...` em
`packages/sdk/src/projeto.ts` é a chave ANÔNIMA, publicável por desenho — o papel
dentro do JWT é `anon`, e ela já vai no pacote do navegador. Nenhum `.env` está
rastreado, e o único arquivo de ambiente no repositório é o `.env.example`.

### Perder a verificação tira a página do ar — 30/09/2026
**A composição que ninguém testava.** Publicar exige registro conferido, e isso já
tinha prova. Mas o selo pode CAIR depois: trocar o registro no conselho o zera por
gatilho, e `publicado` continua `true` — ninguém despublica nada. Se a página
seguisse no ar nesse intervalo, a plataforma estaria emprestando credibilidade a um
registro que ninguém conferiu, justamente no caso mais suspeito: o de quem acabou
de trocar o número.
**A conferência é feita na LEITURA** (`28-site.sql`, na função `pagina_publica`), e
agora tem prova: a página é lida no ar, o selo cai, a página sai do ar, o selo volta
e ela retorna sozinha — nada ficou despublicado. O dono continua vendo a própria
página em todo o intervalo, que é como ele entende o que aconteceu.
**Sobre a prova ser suficiente:** ela não precisa de mutação. A asserção "está no
ar" roda ANTES de derrubar o selo, no mesmo teste — se a conferência de leitura não
existisse, a asserção seguinte falharia. O estado é devolvido num `finally`, e a
suíte inteira do SDK (292 provas) roda limpa depois.

### A verificação do conselho virou prova de banco — 30/09/2026
**Era:** o selo `verificadoEm` é o que decide quem pode ler dado de saúde de outra
pessoa, e duas regras o sustentam em `15-perfil.sql` — ninguém se verifica, e
trocar o registro derruba a verificação. As duas estavam **impostas e sem prova**.
A tela de perfil avisa que a troca remove o selo; nada garantia que o aviso fosse
verdade.
**Por que importa:** sem a primeira, um profissional que consiga escrever o próprio
selo dispensa a análise inteira e passa a ler exame e prescrição sem que ninguém
tenha olhado o registro dele. Sem a segunda, bastaria ser aprovado com um número
válido e trocar depois: o selo ficaria de pé sobre um registro que ninguém
conferiu. E a UF conta — CREF 12345 de São Paulo e do Ceará são pessoas diferentes.
**Prova:** 6 casos em `packages/banco/teste/verificacao-do-conselho.spec.ts`,
rodando contra o banco com a claim que o PostgREST monta. Inclui o lado oposto, que
é o que impede a regra de virar armadilha: corrigir telefone ou bio NÃO derruba o
selo — senão arrumar um dígito custaria uma nova análise e dias sem receber aluno.
**Confirmado por mutação, com cuidado:** o gatilho foi desligado DENTRO de uma
transação revertida, com a escrita e a leitura na mesma transação. Sem ele o selo
fica de pé (a prova ficaria vermelha); no rollback o gatilho volta, e nenhuma
sessão fora dali viu o banco desprotegido. Conferido depois: `tgenabled = 'O'`.
Banco: 204 provas (22 arquivos).

### A ficha do aluno e a importação de dieta — 30/09/2026
**A ficha** só tratava o 403 de consentimento ao listar planos; qualquer outro erro
era engolido, a lista ficava vazia, e o histórico — que não sabe a diferença —
anunciava "Nenhum plano montado ainda". Quem lê isso monta um plano novo para quem
já tem um, **e o ativo é arquivado na hora**: o aluno abre o aplicativo no dia
seguinte com um treino que ninguém prescreveu para aquele dia. Agora falha tem
aviso próprio, que pede para recarregar ANTES de montar outro.
**A importação de dieta** é a única tela em que um modelo de linguagem lê algo e o
resultado vira prescrição. A regra que a sustenta — "a leitura vira um rascunho que
você confere antes de salvar" — passou a ter prova: item sem alimento do catálogo
ou sem quantidade trava o salvamento, a escolha do profissional vence a sugestão
automática, e a falta de autorização ensina o caminho no aplicativo do aluno em vez
de dizer "erro". O texto acima dos botões passou a dizer o que cada um FAZ: ativar
troca o que o aluno vê hoje, e a dieta atual vai para o histórico.
**Prova:** 9 casos em `importar-dieta.test.tsx` e 2 em `ficha-do-aluno.test.tsx`,
confirmados por mutação.
**Nota de método:** a ficha é um hub que monta seis componentes, cada um buscando o
seu. Um método faltando no dublê não some da tela — derruba o render inteiro. É a
quarta vez que isso aparece, e é o melhor argumento a favor da barreira de erro que
as duas interfaces ganharam esta semana.
**E o CI pegou o que eu não peguei:** o primeiro dublê do painel de progresso
devolveu outra forma, e o componente estourou DEPOIS de o teste terminar. As 429
provas passaram, o resumo na tela ficou verde — e o `vitest` saiu com código 1,
porque exceção não capturada reprova a suíte inteira mesmo sem reprovar caso
nenhum. Eu tinha filtrado a saída pelas linhas de resumo e não olhei o código de
saída; o CI não tem esse vício. Desde então a conferência local roda a mesma
sequência do CI, encadeada, para que qualquer código diferente de zero interrompa.

### Recuperar acesso: as três telas que trancam a pessoa do lado de fora — 30/09/2026
**Era:** pedir o link, escolher senha nova e confirmar o e-mail não tinham prova
nenhuma. É a única parte do sistema em que o erro tranca alguém para fora — e quem
não consegue entrar não abre chamado: desiste, e o profissional perde o aluno sem
saber por quê.
**O defeito:** em `verificar-email`, TODO erro virava "Link inválido ou expirado",
com o conselho de pedir um novo. Para uma falha de rede esse conselho é o pior
possível: o link continua valendo, e pedir outro invalida o que a pessoa tem na
mão — com o agravante de que o segundo e-mail pode esbarrar no limite de envio
(pendência do SMTP). Agora falta de conexão tem estado próprio, e a tela diz
explicitamente para NÃO pedir link novo.
**O que as provas também trancam:** a resposta do "esqueci minha senha" é a mesma
exista ou não a conta — inclusive quando a API recusa — porque confirmar
existência transformaria a tela num verificador de quem é cliente de qual
profissional de saúde; a senha nova é conferida pelo MESMO `senhaSchema` do
servidor, sem regra reescrita que aceite o que ele recusa; o link só é gasto uma
vez, mesmo com o React montando duas vezes em desenvolvimento; e o aluno que
redefine senha na web vai para a entrada, não para o painel.
**Prova:** 14 casos em `apps/web/teste/recuperar-acesso.test.tsx`, um confirmado
por mutação.

### A página pública e o site do profissional — 30/09/2026
**A única tela que um estranho abre**, e a que decide se ele vira aluno. Duas
falhas, as duas por a tela falar com certeza sobre o que não sabia:
- **`.catch(() => setNaoExiste(true))`**: qualquer tropeço de rede — sinal fraco no
  celular de quem recebeu o link — dizia "Este endereço não existe ou saiu do ar".
  Não é um vazio inofensivo: é a plataforma afirmando, a um cliente em potencial,
  que aquele profissional fechou as portas. Só 404 é inexistência.
- **O formulário de contato não dizia para onde vão os dados.** Quem preenche não
  tem conta e não aceitou termo nenhum, e entrega nome, e-mail e telefone a duas
  partes: o profissional e a plataforma. Agora há uma linha antes do envio, com o
  nome de quem recebe e o link da política — mínimo da LGPD, e o que permite
  decidir.
**E o estrago mais caro desta dupla, do lado do painel:** `sdk.site.meu()` com
`.catch(() => null)` fazia a falha cair no ramo de PRIMEIRA VISITA — a tela sugeria
um endereço novo a partir do nome e preenchia o título. Publicar depois disso
trocaria a URL pública, e todo link já divulgado (Instagram, cartão, WhatsApp)
deixaria de abrir. Silencioso: parece que nada aconteceu. Agora só 404 é primeira
visita, e enquanto não se sabe o que está no ar a tela avisa para recarregar antes
de publicar. A lista de pedidos de contato recebeu o mesmo tratamento: quem recebeu
três contatos lia "Nenhum pedido ainda. Divulgue o endereço" e parava de divulgar.
**Prova:** 13 casos em `apps/web/teste/pagina-publica.test.tsx`, quatro confirmados
por mutação.

### O portão do painel: verificação de conselho e sessão de aluno — 30/09/2026
**Duas telas sem prova, as duas decidindo QUEM entra.**
**Verificação de profissionais.** Um clique aqui decide quem passa a ler dado de
saúde de outra pessoa, e não se desfaz retroativamente — o que foi lido já foi
lido. A confirmação já era boa (repete registro, UF, nome e conselho, e diz o que
libera), e ganhou prova. O defeito estava na RECUSA: a verificação do motivo
existia só no servidor, e todo erro caía no mesmo `catch` — uma queda de conexão
dizia "o motivo precisa ter ao menos 5 caracteres" sobre um texto de três linhas.
A pessoa reescreve o que já estava certo e tenta de novo, com o mesmo resultado.
Agora o mínimo é `MINIMO_DO_MOTIVO`, exportado do contrato, conferido na tela; e o
botão deixou de ficar CINZA sem explicação — quem toca recebe a frase que diz para
que o motivo serve (ele vai para quem se cadastrou, e é o que permite corrigir).
**Sessão de aluno no painel.** O espelho exato do defeito que o aplicativo tinha
com o profissional: o aluno lia "esta área é do profissional", mas `entrar` já
havia criado a sessão e a barreira da área só verificava se HÁ usuário. Fechar a
aba e voltar levava para dentro do painel — menu vazio, todas as telas falhando,
nenhuma explicação. Agora o login encerra a sessão, **e a área tem porta própria**:
sessão de aluno é encerrada ali também, porque ela não vem só do formulário desta
versão — vem de sessão antiga no navegador, de aba aberta antes da correção, de
link compartilhado.
**Prova:** 11 casos em `verificar-profissionais.test.tsx` e 9 em
`entrar-no-painel.test.tsx`, quatro confirmados por mutação.

### O painel também ganhou barreira de erro — 30/09/2026
**Era:** o aplicativo ganhou barreira em 29/09; o painel não tinha nenhuma. Um
erro de render derrubava a árvore e a página ficava BRANCA — sem texto, sem botão,
sem caminho de volta. Três suítes novas deste mês encontraram isso ao montar
fixture sem um campo que a tela lê (a última: `CobrancaComPix.aluno` é string, e um
objeto no lugar dela derruba tudo). Em produção a causa é idêntica: campo novo
chegando `null`, resposta parcial, formato mudado de um lado só — e quem vê é um
profissional no meio de um atendimento.
**Agora:** `apps/web/app/error.tsx`, no formato que o Next exige, com a tela em
`components/TelaQuebrada.tsx` — separada de propósito, porque regra de produto não
deve depender do roteador para ser provada. Ela promete só o que pode cumprir (o
que já estava salvo continua salvo; o que estava sendo preenchido, não), e tem duas
saídas: `reset` do Next, que remonta só o trecho quebrado mantendo menu e sessão, e
um link COMUM para a lista de alunos — a navegação do Next pode ser justamente o
que quebrou. Mostra o `digest` quando existe, que é o que o suporte pede.
**Prova:** 5 casos em `apps/web/teste/tela-quebrada.test.tsx`.

### Receba Fácil ganhou prova, e parou de dizer que a chave não existe — 30/09/2026
**Era:** a tela da chave PIX e do "copia e cola" de cada cobrança, sem teste. O
dado central dela é o DESTINO DO DINHEIRO: chave errada não dá erro em lugar
nenhum — o código é gerado, o aluno paga, e o valor cai na conta de outra pessoa.
A conferência já existia (`validarChavePix`, do contrato), mas nada garantia que a
tela a usava.
**Os dois defeitos:** as duas buscas afirmavam coisas falsas ao falhar. Sem
conseguir ler a chave, a tela dizia "Cadastre sua chave PIX acima" a quem JÁ tem
chave — e desabilitava "Gerar PIX" dando esse motivo. Sem conseguir ler o resumo,
dizia "Nenhuma cobrança em aberto neste mês" a quem tem cinco em atraso.
**Prova:** 11 casos em `apps/web/teste/receba-facil.test.tsx`, dois confirmados
por mutação. Inclui que cobrança PAGA não entra na lista de a receber — gerar
código do que já foi pago é o caminho para receber duas vezes e devolver depois.
**Achado de bandeja:** `CobrancaComPix` é um tipo próprio, e o `aluno` dele é uma
string. A primeira fixture espalhou a cobrança normal (com `aluno: {id, nome}`), e
objeto como filho de React derruba a árvore inteira: a tela ficou EM BRANCO. É a
terceira vez que isso acontece numa suíte nova, e o painel — diferente do
aplicativo — ainda não tem barreira de erro.

### O financeiro ganhou prova, e a mensagem técnica saiu da tela — 30/09/2026
**Era:** a única tela que mexe em dinheiro não tinha teste nenhum, e o pagamento
é registrado à MÃO por quem recebeu — não há gateway. Isso põe três ações de um
clique lado a lado, numa lista de linhas parecidas, e duas não perguntavam nada:
**estornar** desfaz um pagamento já registrado (a cobrança volta a pendente, e
quem erra vai cobrar de novo alguém que pagou) e **cancelar** faz o oposto (o
aluno deixa de dever e a receita sai do mês, em silêncio). Só "remover"
perguntava.
**O que mais apareceu:** o seletor de alunos ficava mudo quando a busca falhava —
sem aluno não se cria cobrança, e o profissional não tinha como saber por quê; e o
campo de parcelas aceitava digitar acima de 36, que o schema recusa, devolvendo
erro só depois de o formulário estar preenchido.
**A família nova encontrada aqui:** `e instanceof Error ? e.message : 'frase'`,
repetido em **19 lugares de 13 arquivos**. O `Error` genérico é justamente o que
não se mostra: dele saem "Failed to fetch", "NetworkError when attempting to fetch
resource" e "Cannot read properties of undefined". Virou `fraseDeErro` em
`apps/web/lib/erros.ts`: só `ErroApi` passa direto (é escrita para gente, e o SDK
já traduz recusa de política e limite de envio), falta de rede recebe frase
própria dizendo que nada foi perdido, e o resto cai na frase da tela — que sabe o
que a pessoa estava tentando fazer.
**Prova:** 13 casos em `apps/web/teste/financeiro.test.tsx`, quatro confirmados
por mutação. Inclui o que a leitura de valor aceita DE PROPÓSITO: "R$ 150 reais"
vira R$ 150,00, porque `paraCentavos` descarta o que não é dígito — tolerância
com quem copia de outro sistema, e não descuido.

### O painel do profissional passou pela mesma varredura — 30/09/2026
**Era:** a auditoria de 29/09 cobriu as 24 telas do aplicativo e encontrou nove
defeitos, quase todos da mesma família: **a tela afirmando "não tem" quando o que
houve foi "não sei"**. O painel tinha as mesmas frases, e do lado de quem
PRESCREVE elas custam mais.
**O que estava errado, e o que cada frase fazia:**
- **Prescrições do aluno:** "Nenhuma prescrição emitida ainda" aparecia ao lado do
  aviso de erro — e é a frase que parece resposta. Quem prescreve em cima dela
  emite de novo o que já está valendo, ou algo que interage com o que não viu.
- **Anamnese:** "Nenhuma anamnese aplicada ainda" esconde alergia, restrição e
  condição de saúde. Lida por quem vai montar a dieta, significa "pode usar
  qualquer ingrediente".
- **Agenda:** "Nenhum atendimento neste dia" faz marcar outra coisa no horário —
  ou não aparecer.
- **Meus alunos:** "Nenhum aluno ativo. Convide alguém" é a frase de quem está
  começando, dita a quem tem trinta alunos e está sem rede.
- **Conversas, materiais, cardápios, receitas, refeições, modelos de anamnese e de
  prescrição, fila de análise do admin:** mesmo padrão, consequência menor.
- **Cinco telas repetiam o mesmo bloco de sete linhas** para listar alunos, com o
  erro engolido: o seletor escrevia "Nenhum aluno ativo" e o profissional
  concluía que perdeu a carteira. Virou o gancho `useAlunosAtivos`, com `falhou`.
- **Seis exclusões falhavam em silêncio:** a recarga trazia o item de volta e a
  tela ficava idêntica ao que era antes do clique — exclusão confirmada, nada
  aconteceu, nenhuma palavra. O aviso agora vem DEPOIS da recarga, porque a
  recarga limpa o erro ao dar certo.
- **O cardápio era a única exclusão do painel sem confirmação:** botão vermelho ao
  lado de "Aplicar", apagando sem volta um molde montado a partir de uma dieta que
  deu certo.
**Prova:** 13 casos em `apps/web/teste/painel-nao-mente.test.tsx`, três deles
confirmados por mutação (reintroduzir o defeito deixa a prova vermelha). A web
passou de 322 para 335 provas.
**O que a varredura NÃO encontrou:** a família do `Number()` cru, que no
aplicativo custou quatro defeitos, não existe no painel — os campos são
`type="number"`, e o navegador já recusa texto antes de o valor chegar ao código.
É a mesma regra em dois lugares onde o mesmo código tem consequências
diferentes.

### A fila de treinos e o rascunho ganharam prova — e duas suítes estavam invisíveis — 29/09/2026
Continuação da cobertura do aplicativo, pelas duas peças onde mora o risco de
"treinou e o sistema não viu". Academia é o pior lugar de rede que existe:
subsolo, paredão, wi-fi de visitante. Nada disso aparece na tela quando dá
errado — é o silêncio que torna a prova necessária.

**Fila de saída (6 casos), com o armazenamento de verdade** (o módulo real sobre
um AsyncStorage em memória, porque um dublê da fila provaria só o dublê): com
rede envia e entrega os recordes da sessão; sem rede o treino **fica gravado** com
a tentativa e o erro anotados; a rede volta e a tentativa seguinte envia; fechar e
reabrir o app não perde nada; erro definitivo sai da fila em vez de travá-la para
sempre; e o mesmo treino registrado duas vezes não vira dois.

Provei que pegam o defeito **simulando a perda**: troquei a anotação de falha por
remoção da fila — o erro clássico de "limpar a fila quando falha" — e **quatro dos
seis** ficaram vermelhos.

**Rascunho do treino em andamento (6 casos):** o que foi registrado volta ao
reabrir a mesma sessão; rascunho de outra sessão ou velho demais é **apagado** ao
ser lido, não só ignorado; gravação truncada não derruba a tela; cada aluno tem o
seu; descartar limpa de verdade.

**Duas coisas piores que um teste vermelho apareceram no caminho:**

1. **Um arquivo de teste que não rodava.** O padrão de inclusão da suíte do
   aplicativo pegava `*.test.tsx` e `*.spec.ts`; o primeiro `*.test.ts` (sem o
   `x`) ficou fora e a suíte rodou 17 provas **como se fossem todas**, sem acusar
   nada. Arquivo de teste que não roda conta como cobertura e não cobre.
2. **`packages/ui` tinha 64 provas que ninguém rodava** — nem o CI, nem as minhas
   auditorias. São contraste de acessibilidade (42) e a matemática dos gráficos
   (22), justamente o tipo de regra que ninguém revisa a olho. Passam todas, e
   agora rodam no CI.

A varredura que achou as duas foi comparar **arquivos de teste no disco** com
**arquivos que cada suíte executa**, pacote por pacote. Virou parte da auditoria.

### O aplicativo passou a ter suíte — começando pelas telas que mais doem — 28/09/2026
Eram 24 telas e **zero teste**, e a assimetria ficou evidente no mesmo dia: a
correção do limite de e-mail nasceu com quatro provas na web e nenhuma no
aplicativo, porque lá não havia onde escrevê-las.

**Onze casos, em duas telas escolhidas por risco:**
- **cadastro recusado** — limite de envio, rede de verdade, servidor com defeito e
  e-mail repetido, cada um com a frase certa, mais o caso positivo (a tela troca
  pelo aviso de confirmar o e-mail). Provei que pegam o defeito **reintroduzindo o
  mapeamento antigo**: dois falharam, e voltaram a passar com a correção.
- **autorizações** — conceder é um toque; **retirar pergunta antes e não retira
  nada sem resposta**; confirmar retira o consentimento certo; cancelar não
  retira; e o texto que a pessoa lê é o mesmo que fica gravado. É o "específico e
  informado" da LGPD, e estava sem prova nenhuma.

**O ambiente:** `react-native-web` pelo mesmo caminho do `expo start --web`, que é
como o aplicativo foi operado na auditoria. O que ele não cobre está dito na
configuração: gesto, layout nativo, permissão de câmera e módulo nativo não têm
substituto a um aparelho de verdade.

**Uma armadilha que vale lembrar:** o dublê do `Alert` entrava por
`react-native/Libraries/Alert/Alert` — o caminho NATIVO — e não interceptava nada.
O teste da revogação passava reto, sem registrar pergunta alguma, dando a
impressão de cobrir justamente o que não cobria. Passou a entrar por
`react-native`, que a suíte aponta para o web.

A suíte entrou no CI, ao lado de contracts, web e banco. Também atualizei o
lockfile: as dependências novas tinham sido declaradas sem reinstalar, e o
`--frozen-lockfile` do CI reprovaria — a mesma regra que a Cloudflare usa.

### Auditoria operando as duas interfaces — quatro defeitos, 28/09/2026
As auditorias anteriores liam código, banco e rede. Esta **usou o produto**: web
em `localhost:3000` e aplicativo em modo web em `localhost:8081`, entrando com as
contas da semente, clicando nas telas e escrevendo de verdade. Foi a primeira vez,
e cada defeito abaixo estava invisível para as 1.160 provas automatizadas.

**1. As regras de acesso não podiam mais ser aplicadas.** `aplicar-rls.ts` morria
em `relation "public.SessaoRefresh" does not exist`: a migração de 22/09 apagou as
três tabelas da autenticação antiga e duas linhas que ligavam RLS nelas ficaram
nos arquivos 05 e 99. O efeito é o pior possível numa ferramenta de regras —
**aplicação parcial**: tudo depois do arquivo 05 não rodava. O banco em produção
seguia correto (as regras já estavam nele), e é por isso que nenhum auditor
acusou: auditor LÊ O BANCO, não reaplica os arquivos. Corrigido, e o
`rls:conferir` passou a validar também as TABELAS citadas — provado com um
arquivo temporário citando tabela inexistente (acusa e sai com código 1).

**2. A saudação não tinha nome, em nenhuma das duas interfaces.** "Olá," e mais
nada. O cliente lia o nome de `user_metadata` do Auth, que as contas criadas por
`semear-auth` nunca tiveram — e que, pior, é cópia: não acompanharia a troca de
nome no perfil. Agora o hook do token leva `vivio_nome`, lido de `public."User"`,
que é a fonte. Provado nas duas pontas, inclusive o caso da renomeação.

**3. O limite de e-mail do Supabase aparecia como falta de internet.** O
cadastro respondeu `429 over_email_send_rate_limit` (o projeto está no serviço
embutido, que envia poucos por hora) e a tela disse **"Sem conexão com o
servidor. Verifique a internet e tente de novo."** A pessoa tem internet; o
servidor respondeu "espere". O padrão certo já existia na tela de login, com
comentário e tudo, e não tinha sido aplicado no cadastro — nas duas interfaces.
Corrigido, com quatro casos de teste que separam limite, rede de verdade e
servidor com defeito.

**4. A sigla do conselho dobrava.** Quem digita "CREF 012345-G" no campo que pede
só o número gerava `CREF CREF 012345-G` — o valor que o admin confere contra o
conselho, e a chave de unicidade por (tipo, registro, UF), onde as duas formas
conviveriam como profissionais diferentes. Virou regra em
`@vivio/contracts/conselho.ts`, com o caso do conselho TROCADO deixado à vista de
propósito (apagar seria decidir pela pessoa qual afirmação estava certa).

**Um dado corrompido, corrigido:** o nome de um plano da semente estava gravado
com o caractere de substituição (`efbfbd`), e a tela mostrava "Full body � 2x por
semana". Varri as sete colunas de texto do produto: era o único.

**O que foi exercitado e funciona:** login nas duas interfaces, painel do
profissional com dados reais, ficha do aluno completa (alertas, gráficos de peso
e gordura, metas, gasto energético, planos), biblioteca de 217 exercícios, agenda,
financeiro, materiais, chat com **escrita** (mensagem enviada e persistida), e o
fluxo ponta a ponta: **plano ativado na web apareceu no aplicativo da aluna**, com
exercícios, séries e cargas. No aplicativo: início, treino, nutrição (plano real
com macros), evolução (histórico, recordes), equipe com as autorizações e os
documentos legais ligados.

### Passou a existir cópia dos dados fora do Supabase — resolvida em 2026-09-25
O provedor faz backup diário, e isso cobre a falha do provedor. Não cobre projeto
apagado por engano, cobrança não paga, conta suspensa, nem migração minha que
apague dado — nenhum desses é resolvido por backup que vive dentro do mesmo
projeto.

`pnpm --filter @vivio/banco exportar` grava as 67 tabelas de `public` em JSON
(uma por arquivo, `DESTINO=` escolhe a pasta) mais um `manifesto.json` com a
**ordem de restauração**, a contagem por tabela e o instante. A ordem é o ponto:
exportar é fácil, restaurar tem ordem, e ela é calculada das chaves estrangeiras
do próprio banco — lista escrita à mão envelheceria na primeira tabela nova, em
silêncio. Ciclo de dependência não é tratado como erro: sai separado no
manifesto, porque nenhuma ordem resolve ciclo e quem restaura precisa saber que
ali se adia a conferência das chaves.

**O que ela NÃO cobre, dito no próprio manifesto:** as contas do Supabase Auth
(são do provedor, com as credenciais) e os arquivos do Storage — o acervo volta
com `subir-catalogo`, mas foto de evolução e laudo só existem lá.

**E a primeira execução de verdade achou um defeito que nenhum erro denunciava.**
O `numeric` do Postgres não chega como texto pelo `$queryRaw`: chega como objeto
`Decimal`, e o peso de 68,4 kg foi para o arquivo como
`{"s":1,"e":1,"d":[68,4000000]}` — a forma interna da biblioteca. Um backup assim
é ilegível exatamente no dado clínico, e só apareceu porque a saída foi LIDA em
vez de conferida pelo "rodou sem erro". Corrigido, com teste, e agora sai
`"68.4"`.

**Como se prova:** `packages/banco/exportar/ordem.spec.ts`, 11 casos — a ordem
(pai antes de filho, auto-referência que não trava, ciclo que sai separado em vez
de sumir do backup, ordem estável entre execuções) e a serialização (bigint,
data com fuso, `Decimal`, binário em base64).

### O projeto passou a ter verificação automática — resolvida em 2026-09-25
Não havia nenhuma. As suítes rodavam quando alguém lembrava, e a publicação da
web já era automática a cada push — a pior combinação possível: publica sozinho,
confere quando dá.

**`.github/workflows/verificar.yml`**, a cada push e pull request: instala com
lockfile congelado (a mesma regra da Cloudflare, então lockfile desatualizado
reprova aqui e não no deploy), gera o cliente do Prisma, compila os pacotes
internos, confere tipos dos sete pacotes, roda o lint, roda as provas que não
precisam de banco (contracts 344, web 318, banco 110) e, por último, faz o build
do empacotador da Cloudflare — que é onde aparece o que teste não pega, como a
falta do `output: standalone`.

**`.github/workflows/diagnostico.yml`**, todo dia às 9h de Brasília: roda o
comando de diagnóstico contra o que está no ar. Falhando, o GitHub avisa por
e-mail — o monitoramento mais simples que existe sem contratar serviço. Precisa
de dois segredos no repositório (`SUPABASE_URL` e `SUPABASE_POOLER_URL`); sem
eles o trabalho avisa o que falta e encerra, em vez de ficar vermelho todo dia
por configuração ausente, que é o jeito mais rápido de ensinar todo mundo a
ignorar o aviso.

**As três primeiras execuções reprovaram, e foi o melhor argumento a favor
dele.** Nenhuma das três era defeito do código publicado; todas eram
**verificação local passando por motivo errado**:

1. **Tipos da web.** `next-env.d.ts` referencia `.next/types/routes.d.ts`, que o
   `next build` gera e o Git ignora. Aqui o arquivo existia de builds antigos —
   o typecheck vinha passando por resto de build. Num clone limpo, falha. Virou
   passo com `next typegen`.
2. **Tipos do aplicativo.** O passo compilava só as dependências da web, e o app
   caiu em "Cannot find module '@vivio/ui-native'". De novo: aqui o `dist` estava
   no disco.
3. **Fuso horário.** A prova de `dataLocalDoCheckin` exige que a data local
   divirja da data em UTC — e essa divergência **só existe num fuso atrás do
   UTC**. Em UTC a asserção cai. A suíte de contracts passou a rodar em
   `America/Sao_Paulo`, que é o relógio do aluno; deixar o resultado depender do
   fuso de quem roda é descobrir a diferença no dia do deploy. O arquivo de
   configuração novo ainda caiu fora do tsconfig (sem verificação nenhuma), e
   contracts ganhou o par amplo/build que o `sdk` já tinha.

**O que o CI não faz, e é decisão e não limitação:** não roda as provas de
política de acesso nem a suíte do SDK. Elas falam com o Supabase do projeto — o
mesmo que serve o app — e criam e apagam contas. Rodá-las a cada push seria mexer
em dado de produção de dentro de um runner. Para isso existe
`vitest.sem-banco.config.ts`, que separa as onze provas de decisão pura das que
só se provam contra um Postgres de verdade; quem publica continua rodando
`pnpm test` completo com a credencial em mãos.

### A auditoria virou um comando — resolvida em 2026-09-25
Conferir o sistema no ar levava dezenas de comandos à mão: páginas públicas,
cabeçalhos de segurança, se a função de borda está publicada, se a rotina do
banco rodou, sobras de execução de teste, chaves de mídia sem arquivo. Cada
achado das auditorias de 22 e 25/09 apareceu porque alguém lembrou de olhar — e
conferência que depende de lembrança não acontece na semana em que mais importa.

Agora é `pnpm --filter @vivio/banco diagnostico`: 18 checagens, sai com código 1
se algo reprovar, não escreve nada em lugar nenhum. As **regras de decisão** ficam
separadas da coleta (`diagnostico/regras.ts`), com 15 casos de teste — cada regra
provada pelos dois lados, o estado bom e o estado ruim que ela existe para pegar.
Todos os estados ruins testados aconteceram de verdade aqui: o site sem nenhum
cabeçalho, a função respondendo 404 por duas semanas, a rotina registrada e
parada, a chave apontando para arquivo que não existe.

Um diagnóstico sem teste é pior do que nenhum: basta uma comparação invertida
para ele aprovar tudo para sempre, com a aparência de conferência.

**Primeira execução real:** nada reprovou, com uma nota — o PDF de teste órfão no
compartimento `exames`, que a proteção do ambiente me impede de apagar.

### Os seis efeitos com dependência faltando — resolvida em 2026-09-25
Era a pendência 25. Seis `useEffect` tinham a lista de dependências escrita à
mão e **certa por manutenção, não por construção**: funcionavam porque alguém as
mantinha corretas. O risco era latente — quem editasse a função de recarga para
ler um estado novo e esquecesse de acrescentá-lo ganharia um closure velho: a
tela mostrando o resultado anterior, sem erro nenhum.

As funções de recarga viraram `useCallback` com as dependências reais, e o
efeito passou a depender delas. O `eslint` não acusa mais nenhum caso.

**O caso do menu foi o que ensinou algo.** Lá a dependência correta (`blocos`)
não podia simplesmente entrar na lista: `menuPara(papel)` devolve array novo a
cada render, então o efeito rodaria sempre, chamaria `setAbertas` com um objeto
novo, e o render seguinte repetiria tudo — **laço infinito**. Só depois de
memorizar com `useMemo` (e de só mexer no estado quando a seção ainda não está
aberta) a dependência honesta ficou segura.

**Como se prova:** `apps/web/teste/recarga-das-telas.test.tsx`, 5 casos. Eles
verificam o par: a tela recarrega quando o que ela observa muda (busca digitada,
troca de aluno, troca de página) e **não recarrega em laço** — o teste do menu
termina de renderizar, o que é a prova de que não há laço, porque se houvesse ele
travaria. Era exatamente esse teste que faltava para a pendência poder ser paga,
e foi o motivo de ela ter ficado aberta.

O aplicativo (nutrição e fotos) recebeu a mesma correção. Na época ele não tinha
suíte; passou a ter em 28/09 — mas essas duas telas continuam sem prova, porque as
primeiras onze foram para cadastro e autorizações.

### A suíte de banco parou de depender de IPv6 — e "no tests" parou de passar por aprovação — resolvida em 2026-09-25
**O que aconteceu:** no meio da auditoria, a suíte de banco terminou com
`Test Files  no tests`. Nada vermelho, nada rodado. A causa: o host direto do
Supabase (`db.<ref>.supabase.co`) tem **só registro AAAA** — responde apenas em
IPv6 — e o IPv6 desta rede caiu. O guarda de produção, que roda antes de coletar
os arquivos, morreu com `Can't reach database server`, que se lê como banco fora
do ar. O banco estava de pé: o site seguia respondendo, porque fala HTTPS sobre
IPv4 com o PostgREST, e o agendador de lembretes continuou disparando dentro do
Postgres.

**O que foi feito:** `packages/banco/conexao.ts` passou a ser o único lugar que
decide a URL, e prefere o **pooler** (`...pooler.supabase.com`), que tem IPv4 e
atende em modo sessão — transação e DDL passam como numa conexão comum. Os doze
pontos que montavam a URL na mão (ferramentas e suítes) usam o helper, e o
guarda de produção passou a ler `.env.supabase`, onde esse endereço mora; sem
isso ele continuava indo ao host IPv6 mesmo com o pooler configurado.

**O achado mais importante não foi a rede.** Foi a suíte ter terminado dizendo
"no tests" e isso ter parecido tudo bem. `passWithNoTests: false` agora está
explícito no `vitest.config.ts` do pacote: zero teste é falha. Suíte que não roda
nada não aprova nada — e essa é a diferença entre uma auditoria e uma sensação
de segurança.

**Como se prova:** 19 arquivos e 171 casos passando pelo pooler, e as três
ferramentas (`rls:conferir`, `rls:auditar`, exportação de regras) pelo mesmo
caminho.

### O Railway saiu do repositório — encerrada em 2026-09-24
Não resta dependência dele em lugar nenhum: o site é construído e servido pela
Cloudflare a cada push, o banco e o armazenamento são o Supabase, e a única
função de servidor é uma função de borda. Saíram nesta limpeza o `Dockerfile` da
web e o `.dockerignore` (existiam só para a imagem que ia para lá), o
`output: 'standalone'` do Next (que servia a essa imagem) e o `.env.example`
inteiro, que ainda pedia segredo de JWT, bucket R2, Redis e FCM — coisas de uma
API que não existe mais. O modelo novo pede o que de fato se usa: endereço do
Supabase, chave anônima, chave de serviço e conexão direta com o Postgres.

Com isso, duas pendências deixaram de existir por não terem mais onde acontecer:
- **15. E-mail de produção.** Era o Resend configurado na API, com a pedra do
  caminho de a plataforma bloquear a porta 587. Quem manda e-mail de verificação
  e de redefinição hoje é o Supabase Auth.
- **19. Mídia em disco de contêiner.** O disco efêmero que apagava foto de
  evolução a cada deploy não existe: a mídia vive no Storage do Supabase, com
  seis compartimentos e política própria, e a conferência de chaves apontando
  para arquivo ausente virou rotina da auditoria (hoje: zero).

### A leitura automática de dieta entrou no ar — e o teste achou um defeito nela — resolvida em 2026-09-22
A função de borda `ler-dieta` foi publicada no projeto do Supabase (o dono pôs a
chave da Anthropic como segredo; ela não passa pelo repositório nem por mim). O
endereço saiu de 404 para 401, e uma chamada autenticada prova que o segredo
está com o nome certo: ela passa da conferência da chave e para na trava
seguinte.

**O defeito, achado ao escrever a prova:** a função decidia o dono da pasta por
`auth.getUser()`, caindo no id do **Supabase Auth**. Mas a chave do arquivo é
`materiais/<id do app>/...` — é esse o id que a política do compartimento
exige — e os dois são diferentes em **todas as sete contas** de hoje, porque
nasceram antes do Auth. Resultado: a importação responderia "chave de arquivo
não pertence a você" para qualquer pessoa, sempre. Agora o dono vem de
`usuario_atual()`, derivado da claim do token verificado — a mesma função que
as políticas usam.

**Como se prova:** `packages/sdk/teste/leitura-de-dieta.spec.ts`, 8 casos, e
nenhum gasta uma leitura paga: as seis recusas (sem sessão, aluno, sem vínculo,
sem NUTRICAO, sem LEITURA_AUTOMATICA, chave de outra pessoa) e os dois casos
legítimos, que atravessam todas as travas e param no passo seguinte — o arquivo
que não existe. Era esse par que faltava: sem ele, o defeito acima passaria
despercebido, porque toda recusa continuava verde.

**De quebra:** `importarDieta` morava no grupo `exercicios` do SDK, por engano
de lugar. Foi para `dietas`, com a tela ajustada.

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

**Nada ficou pendente daqui.** A conferência do volume do Railway, que este
texto pedia, foi descartada por decisão do dono em 24/09: o Railway não faz mais
parte do projeto em nenhuma forma. A mídia que importava — as 32 figuras do
acervo — já está no Storage do Supabase, e nenhuma chave do banco aponta para
arquivo ausente.

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
