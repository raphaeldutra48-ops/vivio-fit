import { defineConfig } from 'vitest/config';

/**
 * As regras de data deste pacote são sobre gente no Brasil, e a suíte roda no
 * fuso de quem usa o app — não no de quem roda o teste.
 *
 * ## O que o CI ensinou
 *
 * A prova de `dataLocalDoCheckin` passava aqui e reprovava no runner do GitHub.
 * Não era defeito de nenhum dos dois: o caso que ela prova — o check-in das 22h
 * que `toISOString()` jogaria para o dia seguinte — **só existe num fuso atrás
 * do UTC**. Rodando em UTC, a divergência que a função corrige não acontece, e a
 * asserção que exige a divergência cai.
 *
 * Fixar o fuso é o certo aqui: o produto atende alunos no Brasil, o bug que a
 * função previne é o do relógio deles, e o teste tem de exercitar esse relógio
 * em qualquer máquina. O que NÃO seria certo é o contrário — deixar o teste
 * depender do fuso de quem o roda e descobrir a diferença no dia do deploy.
 *
 * Fernando de Noronha (UTC-2) e Rio Branco (UTC-5) continuam cobertos pelas
 * provas que passam o fuso explicitamente, como a do disparo de lembretes.
 */
export default defineConfig({
  test: {
    env: { TZ: 'America/Sao_Paulo' },
  },
});
