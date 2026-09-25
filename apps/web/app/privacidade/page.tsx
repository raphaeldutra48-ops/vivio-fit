import type { Metadata } from 'next';
import { VERSAO_TERMO_ATUAL } from '@vivio/contracts';
import { DocumentoLegal, Secao } from '../../components/DocumentoLegal';

export const metadata: Metadata = {
  title: 'Política de privacidade — Vívio Fit',
  description: 'Que dados o Vívio Fit trata, por quê, com quem compartilha e como você controla.',
};

/**
 * A política descreve o sistema real, e cada afirmação aqui tem lastro no
 * código: as categorias de dado saem das tabelas, os consentimentos são os que
 * as políticas do banco exigem, e a lista de quem recebe dado é a lista de
 * serviços que o app chama. Quando o sistema mudar, este texto muda com ele —
 * do contrário vira promessa que o software não cumpre.
 */
export default function Privacidade() {
  return (
    <DocumentoLegal
      titulo="Política de privacidade"
      versao={VERSAO_TERMO_ATUAL}
      atualizadoEm="25 de setembro de 2026"
    >
      <Secao titulo="1. Quem trata seus dados">
        <p>
          O Vívio Fit é operado por <strong>[PREENCHER: razão social, CNPJ e endereço]</strong>, que
          é o controlador dos dados tratados na plataforma. Para falar sobre privacidade, inclusive
          para exercer qualquer direito desta política:{' '}
          <strong>[PREENCHER: e-mail de contato do encarregado]</strong>.
        </p>
        <p className="mt-xs">
          O profissional que acompanha você (personal trainer, nutricionista ou médico) também é
          controlador dos dados de saúde que registra a seu respeito, porque a decisão clínica é
          dele. A plataforma é a ferramenta onde esse registro acontece.
        </p>
      </Secao>

      <Secao titulo="2. Que dados tratamos">
        <p>Só o que as telas pedem, e cada grupo com uma finalidade declarada:</p>
        <ul className="list-disc pl-lg mt-xs space-y-1">
          <li>
            <strong>Conta:</strong> nome, e-mail, papel (aluno ou profissional) e senha, que fica
            guardada apenas como verificação criptográfica no serviço de autenticação — nunca em
            texto legível, nem para nós.
          </li>
          <li>
            <strong>Profissional:</strong> registro no conselho (CREF, CRN ou CRM), UF,
            especialidades, telefone e, se você publicar a página pública, o que escolher mostrar
            nela.
          </li>
          <li>
            <strong>Aluno:</strong> data de nascimento, altura, sexo biológico (usado no cálculo
            metabólico), objetivo, nível de atividade e fuso horário.
          </li>
          <li>
            <strong>Dado de saúde:</strong> medidas corporais, fotos de evolução, avaliações de
            composição corporal, calorimetria, condições de saúde, exames laboratoriais (inclusive o
            arquivo do laudo), alertas clínicos derivados deles, prescrições, anamneses, treinos e
            execuções, plano alimentar e registros de refeição, água e atividade cardiovascular.
          </li>
          <li>
            <strong>Uso e segurança:</strong> registro de acessos aos dados de cada aluno — quem
            acessou, o quê, quando, com endereço IP e navegador — e o identificador do aparelho,
            quando você ativa lembretes.
          </li>
          <li>
            <strong>Financeiro:</strong> cobranças lançadas pelo profissional e a chave PIX dele. A
            plataforma não recebe pagamento e não trata dado de cartão.
          </li>
          <li>
            <strong>Mensagens:</strong> as conversas entre aluno e profissional dentro do app.
          </li>
        </ul>
      </Secao>

      <Secao titulo="3. Por que tratamos, e com que base legal">
        <p>
          Dado de saúde é dado sensível (LGPD, art. 11). O tratamento dele aqui se apoia no{' '}
          <strong>seu consentimento específico por finalidade</strong>, dado por você e revogável a
          qualquer momento. Os dados da conta são tratados para executar o contrato de uso da
          plataforma; os registros de acesso e segurança, para cumprir o dever de proteger e para
          permitir que você audite quem viu o que é seu.
        </p>
      </Secao>

      <Secao titulo="4. Suas autorizações, uma por finalidade">
        <p>
          Autorizar um profissional a acompanhar você não abre tudo de uma vez. Cada finalidade é
          uma autorização separada, e o sistema recusa o acesso que não foi autorizado — não é
          cortesia da tela, é regra dentro do banco de dados:
        </p>
        <ul className="list-disc pl-lg mt-xs space-y-1">
          <li>
            <strong>Treino:</strong> planos, execuções e atividade cardiovascular.
          </li>
          <li>
            <strong>Nutrição:</strong> plano alimentar e registros de refeição.
          </li>
          <li>
            <strong>Evolução:</strong> medidas, avaliações e fotos de antes e depois.
          </li>
          <li>
            <strong>Clínico:</strong> condições de saúde, exames e prescrições. O arquivo do laudo e
            o marcador de origem de um alerta ficam restritos a quem pode vê-los pela profissão — o
            personal recebe a orientação derivada, nunca o exame.
          </li>
          <li>
            <strong>Mensagens:</strong> a conversa entre os profissionais da sua equipe a seu
            respeito.
          </li>
          <li>
            <strong>Leitura automática de documentos:</strong> autorização destacada, exigida para
            enviar um documento seu (como um plano alimentar em PDF) a um serviço de terceiro que o
            transcreve por máquina. Autorizar a nutrição <em>não</em> autoriza isso.
          </li>
        </ul>
        <p className="mt-xs">
          Ao revogar, o acesso fecha na mesma hora. Se um profissional havia compartilhado um dado
          seu com outro (o médico autorizando a nutricionista a ver um exame, por exemplo), essa
          permissão é derivada da dele: quando você revoga, ela cai junto.
        </p>
      </Secao>

      <Secao titulo="5. Com quem seus dados são compartilhados">
        <ul className="list-disc pl-lg space-y-1">
          <li>
            <strong>Seus profissionais</strong>, apenas com vínculo ativo e dentro das finalidades
            que você autorizou.
          </li>
          <li>
            <strong>Outro profissional da sua equipe</strong>, quando um deles pede e o que detém o
            dado autoriza — sempre limitado ao que você já havia autorizado a quem autorizou.
          </li>
          <li>
            <strong>Supabase</strong> (infraestrutura de banco de dados, arquivos e autenticação),
            com os dados hospedados em região no Brasil (São Paulo).
          </li>
          <li>
            <strong>Cloudflare</strong>, que entrega as páginas do site.
          </li>
          <li>
            <strong>Anthropic</strong>, somente quando você autoriza a leitura automática de
            documentos, e somente o documento em questão. É{' '}
            <strong>transferência internacional</strong>: o serviço processa fora do Brasil. Sem essa
            autorização, nenhum documento seu sai da plataforma.
          </li>
          <li>
            <strong>Serviço de vídeo do acervo</strong>, que entrega as demonstrações de exercício.
            Ele recebe o pedido do vídeo, não dados seus.
          </li>
        </ul>
        <p className="mt-xs">
          Não vendemos dados, não usamos para publicidade e não fazemos perfilamento para terceiros.
        </p>
      </Secao>

      <Secao titulo="6. Quem viu meus dados">
        <p>
          Todo acesso de outra pessoa aos seus dados fica registrado, e você vê essa lista no
          aplicativo: quem acessou, o que, quando — e também as tentativas recusadas por falta de
          autorização. O profissional não vê essa lista e não sabe se você a consultou.
        </p>
      </Secao>

      <Secao titulo="7. Seus direitos">
        <p>
          A LGPD garante confirmação de tratamento, acesso, correção, portabilidade, informação
          sobre compartilhamento, revogação de consentimento e eliminação. Revogação e acesso ao
          registro estão nas telas do app. Para os demais, escreva para{' '}
          <strong>[PREENCHER: e-mail de contato]</strong>; respondemos em{' '}
          <strong>[PREENCHER: prazo, p. ex. 15 dias]</strong>.
        </p>
        <p className="mt-xs">
          <strong>Exclusão:</strong> hoje o pedido é atendido manualmente pelo contato acima — não
          existe botão na tela. Parte do que você pediu para apagar pode precisar ser guardada por
          obrigação legal ou profissional do seu profissional de saúde;{' '}
          <strong>[PREENCHER: prazos de guarda]</strong>.
        </p>
      </Secao>

      <Secao titulo="8. Como protegemos">
        <p>
          O acesso é decidido dentro do banco de dados, linha por linha: uma consulta feita por quem
          não tem vínculo e autorização não devolve nada, mesmo que o programa peça. Colunas
          sensíveis — o arquivo do exame, o marcador de origem de um alerta — ficam fora do alcance
          de quem não pode vê-las pela profissão. Arquivos ficam em compartimentos privados,
          entregues por link temporário. O tráfego é cifrado. Todo acesso é registrado.
        </p>
      </Secao>

      <Secao titulo="9. Por quanto tempo guardamos">
        <p>
          Enquanto sua conta existir e a autorização estiver vigente, e depois disso pelo prazo
          necessário para cumprir obrigação legal ou profissional:{' '}
          <strong>[PREENCHER: prazos por categoria]</strong>. Registros de acesso são mantidos para
          que a auditoria continue possível.
        </p>
      </Secao>

      <Secao titulo="10. Crianças e adolescentes">
        <p>
          <strong>[PREENCHER: política de idade mínima e consentimento de responsável.]</strong> O
          tratamento de dado de menor exige consentimento específico de um dos pais ou do
          responsável legal (LGPD, art. 14).
        </p>
      </Secao>

      <Secao titulo="11. Mudanças nesta política">
        <p>
          Quando o texto mudar de forma relevante, a versão muda com ele, e o aceite anterior deixa
          de valer para as finalidades novas — a autorização é registrada junto com a versão que
          você leu. A versão vigente é a que aparece no topo desta página.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
