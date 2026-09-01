import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Repetir uma ação de tempos em tempos — **só enquanto o app está na frente**.
 *
 * Por que existe como gancho, e não solto em cada tela: as duas sondagens do
 * aplicativo (a fila de sincronização, a cada 30 s, e o chat, a cada 15 s)
 * tinham `setInterval` que nunca parava. Celular no bolso, app fechado pelo
 * usuário mas ainda vivo em segundo plano, continuava batendo na API a cada 30
 * segundos por tempo indeterminado — gastando bateria e franquia de dados de
 * quem não estava usando nada.
 *
 * Não é só desligar. Ao voltar para a frente, a ação roda **na hora**, antes de
 * o próximo intervalo vencer: quem reabre o app quer o dado agora, não daqui a
 * meio minuto. Sem isso, pausar deixaria a tela desatualizada justamente no
 * instante em que a pessoa está olhando para ela.
 */
export function useSondagem(acao: () => void, intervaloMs: number, ativa = true): void {
  /*
    A ação vive numa referência porque quase toda chamada passa uma função
    nova a cada render. Sem isto, o efeito se refaria a cada render e o
    intervalo reiniciaria antes de vencer — uma sondagem que nunca dispara.
  */
  const ultima = useRef(acao);
  ultima.current = acao;

  useEffect(() => {
    if (!ativa) return;

    let intervalo: ReturnType<typeof setInterval> | null = null;

    const ligar = () => {
      if (intervalo === null) intervalo = setInterval(() => ultima.current(), intervaloMs);
    };
    const desligar = () => {
      if (intervalo !== null) {
        clearInterval(intervalo);
        intervalo = null;
      }
    };

    ligar();

    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        ultima.current();
        ligar();
      } else {
        // 'background' e 'inactive'. O 'inactive' do iOS aparece em transições
        // curtas (central de controle, troca de app); parar nele também é
        // certo — a tela não está sendo lida.
        desligar();
      }
    });

    return () => {
      inscricao.remove();
      desligar();
    };
  }, [intervaloMs, ativa]);
}
