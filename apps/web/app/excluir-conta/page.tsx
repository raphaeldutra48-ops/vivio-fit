import type { Metadata } from 'next';
import { CONTATO_DE_PRIVACIDADE, VERSAO_TERMO_ATUAL, pedidoDeExclusaoPorEmail } from '@vivio/contracts';
import { DocumentoLegal, Secao } from '../../components/DocumentoLegal';

export const metadata: Metadata = {
  title: 'Excluir sua conta — Vívio Fit',
  description: 'Como pedir a exclusão da sua conta no Vívio Fit, e o que pode precisar ser guardado.',
};

/**
 * Como pedir a exclusão da conta — a página que o app abre e que a loja exige.
 *
 * Pública, como os outros documentos: quem já perdeu o acesso à conta também
 * precisa conseguir ler isto. E é uma página, e não um botão que apaga, por uma
 * decisão que NÃO é de implementação (pendência 27): parte do que um
 * profissional de saúde registrou pode precisar ser guardada por obrigação dele,
 * e quem decide o que fica é o controlador, com revisão jurídica. Este texto não
 * promete o que ninguém decidiu ainda — diz como pedir, quem analisa e o que a
 * pessoa já pode fazer sozinha, que é tudo verdade hoje.
 */
export default function ExcluirConta() {
  const email = pedidoDeExclusaoPorEmail(CONTATO_DE_PRIVACIDADE);
  return (
    <DocumentoLegal titulo="Excluir sua conta" versao={VERSAO_TERMO_ATUAL} atualizadoEm="5 de novembro de 2026">
      <Secao titulo="Como pedir">
        <p>
          Escreva para <strong>{CONTATO_DE_PRIVACIDADE}</strong> a partir do e-mail cadastrado na sua
          conta, com o assunto <strong>“Excluir minha conta”</strong>. Pedir pelo mesmo e-mail é o que
          confirma que a conta é sua.
        </p>
        {email ? (
          <p className="mt-md">
            <a href={email} className="underline font-semibold">
              Pedir a exclusão por e-mail
            </a>
          </p>
        ) : (
          <p className="mt-md" style={{ color: 'var(--vv-texto-secundario)' }}>
            O endereço de contato ainda não foi definido nesta versão do documento.
          </p>
        )}
        <p className="mt-md">
          O pedido é analisado por uma pessoa, e não por uma máquina, em até{' '}
          <strong>[PREENCHER: prazo, p. ex. 15 dias]</strong>. Você recebe a resposta dizendo o que foi
          apagado e, se algo precisou ser guardado, o quê e por quê.
        </p>
      </Secao>

      <Secao titulo="O que pode precisar ser guardado">
        <p>
          Parte do que você pedir para apagar pode precisar ser guardada por obrigação legal ou ética
          do seu profissional de saúde — o que ele registrou a seu respeito, como prescrições e
          anamneses; <strong>[PREENCHER: o que é apagado, o que é guardado e por quanto tempo]</strong>.
          A resposta ao seu pedido diz, item por item, o que aconteceu com cada um.
        </p>
      </Secao>

      <Secao titulo="O que você já pode fazer agora, sem pedir a ninguém">
        <ul className="list-disc pl-lg space-y-1">
          <li>
            <strong>Retirar cada autorização</strong> que deu a um profissional, na tela de equipe do
            aplicativo. O acesso aos dados fecha na mesma hora; um arquivo que ele já tinha aberto pode
            continuar visível por alguns minutos, até o link expirar.
          </li>
          <li>
            <strong>Ver quem acessou seus dados</strong>, inclusive as tentativas recusadas, em “Quem viu
            meus dados”.
          </li>
        </ul>
      </Secao>
    </DocumentoLegal>
  );
}
