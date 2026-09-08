/**
 * O endereço do projeto Supabase e a chave pública dele.
 *
 * ## Por que isto pode morar no repositório
 *
 * A chave `anon` é **pública por desenho**. Ela vai embutida em todo app
 * cliente — web, iOS, Android — e qualquer pessoa que abra o DevTools a
 * enxerga. Não é uma senha esquecida aqui: é um identificador de projeto.
 *
 * O que protege os dados não é essa chave, é o RLS. Com ela e sem sessão, o
 * PostgREST devolve exatamente nada; com sessão, devolve o que as políticas
 * deixarem. É por isso que as 70 tabelas têm política, e é por isso que a
 * suíte gasta tanto tempo provando quem vê o quê.
 *
 * A chave `service_role` é o oposto: ela IGNORA todas as políticas, e por isso
 * vive só no `.env.supabase`, que é ignorado pelo git e nunca chega ao
 * navegador.
 *
 * ## Por que aqui, e não numa variável de ambiente
 *
 * `NEXT_PUBLIC_*` é variável de BUILD: o valor é embutido quando o `next build`
 * roda, então precisaria estar configurada no painel de quem constrói. Uma
 * configuração a mais para esquecer, num valor que não é segredo — e o efeito
 * de esquecê-la é o app subir sem conseguir autenticar ninguém.
 *
 * As variáveis continuam valendo quando existem: quem quiser apontar para
 * outro projeto (uma cópia de teste, por exemplo) define e pronto. Isto é só o
 * padrão.
 *
 * Trocar o projeto ou girar a chave é uma alteração de uma linha aqui.
 */
export const PROJETO_SUPABASE = {
  url: 'https://ywjcixyrckqrwknrxrfh.supabase.co',
  chaveAnonima:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3amNpeHlyY2txcndrbnJ4cmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjc4MDgsImV4cCI6MjEwMzg0MzgwOH0.qGpdU8dtJldwjk5iQf_G01Y15x7s98qEOXGIWXWoBYQ',
} as const;
