'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Campo, Cartao } from '../../../components/ui';

interface Duvida {
  pergunta: string;
  resposta: React.ReactNode;
  /** Palavras que a busca considera além do texto visível. */
  termos?: string;
}

interface Secao {
  titulo: string;
  duvidas: Duvida[];
}

/**
 * Ajuda escrita a partir do que o app realmente faz.
 *
 * As respostas explicam o **porquê** das regras que mais causam dúvida — por
 * que um dado não aparece, por que não dá para editar um plano — porque é isso
 * que evita o suporte por mensagem.
 */
const SECOES: Secao[] = [
  {
    titulo: 'Começando',
    duvidas: [
      {
        pergunta: 'Como adiciono um aluno?',
        termos: 'convidar vincular novo aluno carteira',
        resposta: (
          <>
            Em <Link href="/alunos" className="underline">Meus alunos</Link>, use o campo de
            convite com o e-mail dele. O aluno recebe o convite e precisa <strong>aceitar</strong>{' '}
            pelo aplicativo. Sem esse aceite não existe vínculo — e sem vínculo você não acessa
            nada dele.
          </>
        ),
      },
      {
        pergunta: 'Meu registro precisa ser verificado. O que é isso?',
        termos: 'CREF CRN CRM conselho verificacao aprovar',
        resposta: (
          <>
            Antes de receber alunos, alguém da plataforma confere seu número no conselho
            (CREF, CRN ou CRM). É o que impede qualquer pessoa de se cadastrar como profissional de
            saúde. Enquanto não for verificado, você entra no painel mas não consegue convidar
            aluno nem publicar sua página.
          </>
        ),
      },
    ],
  },
  {
    titulo: 'Acesso aos dados do aluno',
    duvidas: [
      {
        pergunta: 'Por que não vejo os dados de um aluno meu?',
        termos: 'consentimento lgpd permissao bloqueado nao autorizado',
        resposta: (
          <>
            Ter vínculo não dá acesso a tudo. O aluno autoriza <strong>por tipo de dado</strong>:
            treino, nutrição, dados clínicos, evolução e mensagens. Ele pode liberar treino e não
            liberar evolução, por exemplo. A autorização é dada por ele, no aplicativo, e pode ser
            retirada a qualquer momento — quando isso acontece, o acesso cai na hora.
          </>
        ),
      },
      {
        pergunta: 'No relatório aparece "não autorizado" em vez de um número.',
        termos: 'relatorio nao autorizado vazio zero',
        resposta: (
          <>
            Significa que aquele aluno não compartilhou esse tipo de dado com você —{' '}
            <strong>não</strong> que o valor seja zero. Mostrar zero seria mentira, e mostrar o
            dado seria quebrar o que ele decidiu.
          </>
        ),
      },
      {
        pergunta: 'Quem consegue ver o que eu acesso?',
        termos: 'auditoria registro log privacidade',
        resposta: (
          <>
            Todo acesso a dado de saúde fica registrado, inclusive as tentativas negadas. O aluno
            pode consultar esse histórico. É exigência de quem lida com dado sensível, e protege os
            dois lados.
          </>
        ),
      },
    ],
  },
  {
    titulo: 'Treino e dieta',
    duvidas: [
      {
        pergunta: 'Por que não consigo editar um plano que já está ativo?',
        termos: 'editar plano treino dieta versao alterar',
        resposta: (
          <>
            Planos ativos não são editados no lugar: ajustar cria uma{' '}
            <strong>versão nova</strong> e arquiva a anterior. Assim o histórico mostra o que
            estava valendo quando o aluno treinou — se você sobrescrevesse, o registro de um treino
            de três meses atrás passaria a apontar para uma carga que não era aquela.
          </>
        ),
      },
      {
        pergunta: 'Renomeei um alimento e a dieta antiga não mudou. Está certo?',
        termos: 'renomear alimento prescricao congelado historico',
        resposta: (
          <>
            Sim, é proposital. Prescrições e anamneses guardam o nome como estava no dia. Mudar o
            catálogo depois não reescreve o que já foi prescrito ou respondido.
          </>
        ),
      },
    ],
  },
  {
    titulo: 'Prescrição',
    duvidas: [
      {
        pergunta: 'Não consigo prescrever medicamento.',
        termos: 'medicamento privativo medico crm nutricionista',
        resposta: (
          <>
            Prescrever medicamento é privativo do médico. Nutricionista prescreve suplemento e
            fitoterápico dentro da sua área. O app segue a competência de cada conselho — não é
            configuração.
          </>
        ),
      },
    ],
  },
  {
    titulo: 'Financeiro e divulgação',
    duvidas: [
      {
        pergunta: 'O app cobra meus alunos automaticamente?',
        termos: 'cobranca automatica pagamento gateway pix boleto receba facil',
        resposta: (
          <>
            Ainda não. Hoje o{' '}
            <Link href="/financeiro" className="underline">controle financeiro</Link> registra o
            que você combinou e o que já recebeu — quem pagou, quem está devendo, quanto entrou no
            mês. A cobrança automática depende de integração com meio de pagamento e ainda não
            está disponível.
          </>
        ),
      },
      {
        pergunta: 'Marquei um pagamento errado. Dá para desfazer?',
        termos: 'estornar desfazer pagamento errado',
        resposta: <>Sim. Na cobrança paga, use <strong>Estornar</strong>: ela volta a pendente.</>,
      },
      {
        pergunta: 'Como divulgo meu trabalho?',
        termos: 'site pagina publica divulgar captar link',
        resposta: (
          <>
            Em <Link href="/site-profissional" className="underline">Site profissional</Link> você
            monta uma página com endereço próprio para compartilhar nas redes. Quem se interessar
            deixa o contato ali, e o pedido chega para você na mesma tela. Publicar exige o
            registro já verificado.
          </>
        ),
      },
    ],
  },
  {
    titulo: 'Aplicativo do aluno',
    duvidas: [
      {
        pergunta: 'O aluno consegue treinar sem internet?',
        termos: 'offline sem internet sincronizar academia',
        resposta: (
          <>
            Sim. O treino do dia fica salvo no aparelho e o registro das séries é guardado numa
            fila. Quando a conexão volta, sobe sozinho. Academia com sinal ruim é a regra, não a
            exceção.
          </>
        ),
      },
      {
        pergunta: 'Mandei um material e o aluno diz que não recebeu.',
        termos: 'material pdf compartilhar nao chegou visto',
        resposta: (
          <>
            Em <Link href="/materiais" className="underline">Materiais</Link>, cada item mostra com
            quem foi compartilhado e quantos já abriram. Se não aparecer o nome dele, o
            compartilhamento não foi feito — vínculo sozinho não dá acesso à sua biblioteca.
          </>
        ),
      },
    ],
  },
];

export default function Ajuda() {
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const alvo = busca.trim().toLowerCase();
  const secoes = SECOES.map((s) => ({
    ...s,
    duvidas: s.duvidas.filter((d) =>
      alvo
        ? `${d.pergunta} ${d.termos ?? ''}`.toLowerCase().includes(alvo)
        : true,
    ),
  })).filter((s) => s.duvidas.length > 0);

  return (
    <div className="flex flex-col gap-xl">
      <div>
        <h1 className="text-2xl font-bold">Ajuda</h1>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          As dúvidas mais comuns, e o porquê das regras que mais confundem.
        </p>
      </div>

      <Campo
        rotulo="Buscar"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="consentimento, cobrança, offline…"
      />

      {secoes.map((secao) => (
        <section key={secao.titulo}>
          <h2 className="mb-md text-lg font-semibold">{secao.titulo}</h2>
          <div className="flex flex-col gap-sm">
            {secao.duvidas.map((d) => {
              const abertaAgora = aberta === d.pergunta || Boolean(alvo);
              return (
                <Cartao key={d.pergunta}>
                  <button
                    onClick={() => setAberta(aberta === d.pergunta ? null : d.pergunta)}
                    aria-expanded={abertaAgora}
                    className="flex w-full items-center justify-between gap-md text-left font-medium"
                  >
                    {d.pergunta}
                    <span aria-hidden="true" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {abertaAgora ? '−' : '+'}
                    </span>
                  </button>
                  {abertaAgora && (
                    <div className="mt-md leading-relaxed" style={{ color: 'var(--vv-texto-secundario)' }}>
                      {d.resposta}
                    </div>
                  )}
                </Cartao>
              );
            })}
          </div>
        </section>
      ))}

      {secoes.length === 0 && (
        <p style={{ color: 'var(--vv-texto-secundario)' }}>
          Nada encontrado para “{busca}”.
        </p>
      )}

      <Cartao>
        <p className="mb-xs font-semibold">Não achou?</p>
        <p className="text-sm" style={{ color: 'var(--vv-texto-secundario)' }}>
          Escreva para{' '}
          <a href="mailto:suporte@viviofit.com.br" className="underline">
            suporte@viviofit.com.br
          </a>
          . Se for sobre um aluno específico, diga o nome dele — não mande dado de saúde por e-mail.
        </p>
      </Cartao>
    </div>
  );
}
