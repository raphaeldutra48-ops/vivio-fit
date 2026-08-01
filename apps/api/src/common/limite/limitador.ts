/**
 * Contador de tentativas por chave, em memória, com janela fixa.
 *
 * Deliberadamente sem Redis: rate limit distribuído é a pendência 4b e chega
 * junto com a fila. Um contador por processo não segura um ataque coordenado
 * entre várias instâncias, mas segura o caso que realmente acontece — um script
 * martelando uma conta de um lugar só — e não custa infraestrutura nenhuma.
 *
 * Sem dependência de framework de propósito: assim o comportamento é testável
 * sem subir a aplicação, e o relógio entra por parâmetro.
 */
export class Limitador {
  private readonly baldes = new Map<string, { tentativas: number; expiraEm: number }>();

  constructor(
    /** Tentativas toleradas dentro da janela antes de bloquear. */
    readonly maximo: number,
    readonly janelaMs: number,
    /** Teto de chaves guardadas. Sem ele, IP rotativo vira vazamento de memória. */
    private readonly capacidade = 10_000,
  ) {}

  /** Segundos que faltam para liberar. 0 significa que pode tentar. */
  bloqueadoPor(chave: string, agora = Date.now()): number {
    const balde = this.baldes.get(chave);
    if (!balde || balde.expiraEm <= agora) return 0;
    if (balde.tentativas < this.maximo) return 0;
    return Math.max(1, Math.ceil((balde.expiraEm - agora) / 1000));
  }

  /**
   * Conta uma tentativa. Quem decide o que é "tentativa" é o chamador: no login
   * só a senha errada conta; numa rota que responde 2xx sempre, conta toda
   * requisição.
   */
  registrar(chave: string, agora = Date.now()): void {
    this.podar(agora);

    const balde = this.baldes.get(chave);
    if (!balde || balde.expiraEm <= agora) {
      this.baldes.set(chave, { tentativas: 1, expiraEm: agora + this.janelaMs });
      return;
    }

    // A janela NÃO é renovada a cada tentativa. Renovar transformaria o bloqueio
    // temporário em permanente para quem continua tentando — inclusive para a
    // pessoa que só errou a senha e insiste.
    balde.tentativas += 1;
  }

  /** Chamado quando a tentativa dá certo: acertar a senha zera o histórico. */
  esquecer(chave: string): void {
    this.baldes.delete(chave);
  }

  /** Só para teste. */
  tentativas(chave: string, agora = Date.now()): number {
    const balde = this.baldes.get(chave);
    return !balde || balde.expiraEm <= agora ? 0 : balde.tentativas;
  }

  private podar(agora: number): void {
    if (this.baldes.size < this.capacidade) return;

    for (const [chave, balde] of this.baldes) {
      if (balde.expiraEm <= agora) this.baldes.delete(chave);
    }

    // Ainda cheio: descarta os mais antigos (o Map preserva ordem de inserção).
    // Perder contagem de quem entrou primeiro é ruim; ficar sem memória é pior.
    while (this.baldes.size >= this.capacidade) {
      const primeira = this.baldes.keys().next();
      if (primeira.done) break;
      this.baldes.delete(primeira.value);
    }
  }
}
