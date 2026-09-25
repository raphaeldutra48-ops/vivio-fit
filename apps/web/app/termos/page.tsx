import type { Metadata } from 'next';
import { VERSAO_TERMO_ATUAL } from '@vivio/contracts';
import { DocumentoLegal, Secao } from '../../components/DocumentoLegal';

export const metadata: Metadata = {
  title: 'Termos de uso — Vívio Fit',
  description: 'O que o Vívio Fit é, o que não é, e de quem é cada responsabilidade.',
};

/**
 * Os termos dizem o que o produto faz e, principalmente, o que ele NÃO faz: a
 * plataforma não presta serviço de saúde, não intermedeia pagamento e não emite
 * conduta clínica. Cada uma dessas três frases corresponde a uma decisão de
 * arquitetura que está no código, e é por isso que elas podem ser afirmadas.
 */
export default function Termos() {
  return (
    <DocumentoLegal
      titulo="Termos de uso"
      versao={VERSAO_TERMO_ATUAL}
      atualizadoEm="25 de setembro de 2026"
    >
      <Secao titulo="1. O que é o Vívio Fit">
        <p>
          É uma ferramenta de trabalho para profissionais de saúde e performance — personal trainer,
          nutricionista e médico — e o aplicativo que o aluno deles usa para acompanhar treino,
          alimentação e evolução no mesmo lugar.
        </p>
        <p className="mt-xs">
          <strong>A plataforma não presta serviço de saúde.</strong> Ela não avalia, não diagnostica
          e não prescreve. Quem faz isso é o profissional que você escolheu, e a relação de
          atendimento é entre vocês dois. Nada do que o sistema calcula ou sugere substitui consulta.
        </p>
      </Secao>

      <Secao titulo="2. Quem pode usar">
        <p>
          <strong>Profissional:</strong> precisa de registro ativo no conselho da sua categoria, e a
          conta passa por verificação antes de liberar o atendimento. Alterar o registro faz a
          verificação cair, e ela é feita de novo.
        </p>
        <p className="mt-xs">
          <strong>Aluno:</strong> entra por convite de um profissional, e decide o que cada um pode
          ver. <strong>[PREENCHER: idade mínima e regra para menor de idade.]</strong>
        </p>
      </Secao>

      <Secao titulo="3. De quem é cada responsabilidade">
        <ul className="list-disc pl-lg space-y-1">
          <li>
            <strong>Do profissional:</strong> a conduta. Treino, dieta, prescrição, interpretação de
            exame e o que ele escreve para o aluno são atos profissionais dele, sob o conselho dele.
            A plataforma impede o que é claramente vedado — medicamento só é prescrito por médico,
            por exemplo — mas isso é o piso, não a garantia de adequação do que foi prescrito.
          </li>
          <li>
            <strong>Do aluno:</strong> informar dados verdadeiros. Peso, altura, condição de saúde e
            medicamento em uso alimentam cálculo e alerta; informação errada produz orientação
            errada.
          </li>
          <li>
            <strong>Da plataforma:</strong> manter o sistema funcionando, guardar o que foi
            registrado, e respeitar as autorizações do aluno.
          </li>
        </ul>
      </Secao>

      <Secao titulo="4. Alertas e faixas de referência">
        <p>
          O sistema gera alertas a partir de faixas de referência laboratoriais e funcionais, com a
          fonte citada na página de Metodologia. São referências de leitura, não critério de
          diagnóstico, e o texto que um profissional recebe sobre o achado de outro é orientação
          derivada — cabe a ele decidir o que fazer com ela.
        </p>
      </Secao>

      <Secao titulo="5. Pagamentos">
        <p>
          O pagamento do atendimento acontece <strong>direto entre aluno e profissional</strong>. A
          plataforma gera o código PIX a partir da chave que o profissional cadastra, e nada mais:
          não recebe o dinheiro, não retém taxa, não intermedeia e{' '}
          <strong>não sabe quando o pagamento cai</strong> — é o profissional que confere no banco
          dele e marca como recebido. Cobrança, reembolso e disputa são assunto entre vocês.
        </p>
      </Secao>

      <Secao titulo="6. Leitura automática de documentos">
        <p>
          Quando autorizada pelo aluno, ela transcreve um documento (um plano alimentar em PDF ou
          foto) para dentro do app usando um serviço de terceiro, fora do Brasil. O resultado é{' '}
          <strong>rascunho</strong>: nada é salvo antes de o profissional conferir item por item.
          Transcrição automática erra, e a conferência é parte do fluxo, não formalidade.
        </p>
      </Secao>

      <Secao titulo="7. Conteúdo">
        <p>
          O acervo de exercícios traz imagens e vídeos de terceiros, cada um com seu crédito e sob a
          licença do autor. O que o profissional envia — vídeo de demonstração, material para o
          aluno — continua sendo dele, e ele responde por ter o direito de usá-lo. Não publicamos
          esse conteúdo para fora do app.
        </p>
      </Secao>

      <Secao titulo="8. Uso indevido, suspensão e encerramento">
        <p>
          Contas podem ser suspensas quando houver indício de registro profissional inválido, acesso
          a dado de quem não é seu paciente, ou tentativa de contornar as autorizações do aluno. Você
          pode encerrar sua conta quando quiser — como pedir está na{' '}
          <a href="/privacidade" className="underline">
            política de privacidade
          </a>
          .
        </p>
      </Secao>

      <Secao titulo="9. Limites">
        <p>
          O serviço é fornecido como está, sem garantia de resultado — de treino, de composição
          corporal ou de saúde. Também não garantimos disponibilidade ininterrupta: há manutenção,
          falha de terceiro e indisponibilidade de rede.{' '}
          <strong>[PREENCHER: limitação de responsabilidade, conforme revisão jurídica.]</strong>
        </p>
      </Secao>

      <Secao titulo="10. Mudanças, lei aplicável e foro">
        <p>
          Estes termos podem mudar; mudança relevante troca a versão, e a versão aceita fica
          registrada junto com a autorização. Aplica-se a lei brasileira, com foro em{' '}
          <strong>[PREENCHER: cidade e estado]</strong>.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
