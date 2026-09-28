/**
 * `react-native-web` não publica tipos, e o dublê do `Alert` precisa importar o
 * módulo de verdade para preservar o resto dele (`View`, `Text`, `Pressable`…).
 *
 * A declaração fica aqui, na pasta de teste, e não em `src`: ela existe só para o
 * apelido que a suíte usa. O aplicativo de verdade importa `react-native`, que é
 * tipado, e essa é a diferença que este arquivo NÃO pode apagar — por isso ele
 * não declara nada sobre `react-native`, apenas silencia o módulo web.
 */
declare module 'react-native-web';
