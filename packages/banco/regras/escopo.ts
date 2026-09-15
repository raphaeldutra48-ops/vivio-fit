import {
  EscopoMarcador,
  Papel,
  marcadoresDoEscopo,
  referenciaDe,
  type Marcador,
} from '@vivio/contracts';

/**
 * Quem vê qual marcador.
 *
 * Isolado do serviço de propósito: é a regra que decide exposição de dado de
 * saúde, e ela precisa ser testável sem subir a aplicação. Mesmo motivo pelo
 * qual `consentimentoVigentePara` virou um arquivo só.
 *
 * O personal cai no `NENHUM`. Ele não abre a tela — o controller o barra antes
 * — mas a regra não depende disso: papel sem decisão explícita não vê nada.
 */
export type EscopoDeLeitura = EscopoMarcador | 'TODOS' | 'NENHUM';

export function escopoDoPapel(papel: Papel): EscopoDeLeitura {
  switch (papel) {
    // O aluno é o titular do dado: vê o próprio exame inteiro.
    case Papel.ALUNO:
    case Papel.MEDICO:
      return 'TODOS';
    case Papel.NUTRICIONISTA:
      return EscopoMarcador.NUTRICIONAL;
    default:
      // Papel novo entra sem ver nada até alguém decidir o contrário. O padrão
      // seguro aqui é o silêncio, não a herança do caso anterior.
      return 'NENHUM';
  }
}

export function marcadoresVisiveis(papel: Papel): Marcador[] {
  const escopo = escopoDoPapel(papel);
  if (escopo === 'NENHUM') return [];
  return marcadoresDoEscopo(escopo);
}

export function podeVerMarcador(papel: Papel, marcador: Marcador): boolean {
  const escopo = escopoDoPapel(papel);
  if (escopo === 'NENHUM') return false;
  return escopo === 'TODOS' || referenciaDe(marcador).escopo === escopo;
}

/**
 * O arquivo do exame (PDF ou imagem) é privativo do médico e do aluno.
 *
 * Está na especificação como regra dura: personal e nutricionista **nunca**
 * acessam o arquivo, só o que foi derivado dele.
 */
export function podeVerArquivo(papel: Papel): boolean {
  return papel === Papel.MEDICO || papel === Papel.ALUNO;
}
